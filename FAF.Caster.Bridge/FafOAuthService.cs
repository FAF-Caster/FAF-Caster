using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace FAFCaster.Bridge;

/// <summary>Device authorization (RFC 8628). Tokens remain in process memory only.</summary>
public sealed class FafOAuthService(HttpClient http, IConfiguration configuration)
{
    private readonly object gate = new();
    private string? accessToken;
    private DateTimeOffset expiresAt;
    private string? refreshToken;
    private string? pendingCode;
    private DateTimeOffset pendingExpiry;
    private int pollInterval = 5;
    private DateTimeOffset nextPoll;

    private string? ClientId => configuration["FafOAuth:ClientId"];
    public bool Configured => !string.IsNullOrWhiteSpace(ClientId);
    public object Status()
    {
        lock (gate) return new { configured = Configured, connected = accessToken != null && expiresAt > DateTimeOffset.UtcNow.AddSeconds(30),
            expiresAtUtc = accessToken is null ? (DateTimeOffset?)null : expiresAt, authorizationPending = pendingCode != null && pendingExpiry > DateTimeOffset.UtcNow };
    }

    public async Task<object> BeginAsync(CancellationToken ct)
    {
        if (!Configured) return new { error = "oauth_client_not_configured" };
        using var response = await http.PostAsync("oauth2/device/auth", new FormUrlEncodedContent(new Dictionary<string,string>
        {
            ["client_id"] = ClientId!, ["scope"] = "openid offline public_profile"
        }), ct);
        if (!response.IsSuccessStatusCode) return new { error = "device_authorization_failed", httpStatus = (int)response.StatusCode };
        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
        var root = doc.RootElement;
        string Read(string key) => root.TryGetProperty(key, out var p) ? p.GetString() ?? "" : "";
        var code = Read("device_code");
        var userCode = Read("user_code");
        var verificationUri = Read("verification_uri");
        var completeUri = Read("verification_uri_complete");
        if (string.IsNullOrEmpty(code) || string.IsNullOrEmpty(userCode) || !Uri.TryCreate(verificationUri, UriKind.Absolute, out var verification) ||
            verification.Scheme != Uri.UriSchemeHttps || verification.Host != "hydra.faforever.com")
            return new { error = "invalid_device_response" };
        var interval = root.TryGetProperty("interval", out var i) ? Math.Clamp(i.GetInt32(), 5, 60) : 5;
        var ttl = root.TryGetProperty("expires_in", out var e) ? Math.Clamp(e.GetInt32(), 30, 900) : 600;
        lock (gate) { pendingCode = code; pendingExpiry = DateTimeOffset.UtcNow.AddSeconds(ttl); pollInterval = interval; nextPoll = DateTimeOffset.UtcNow.AddSeconds(interval); }
        return new { userCode, verificationUri, verificationUriComplete = completeUri, expiresIn = ttl, interval };
    }

    public async Task<object> PollAsync(CancellationToken ct)
    {
        string? code;
        lock (gate)
        {
            if (pendingCode is null || DateTimeOffset.UtcNow >= pendingExpiry) { pendingCode = null; return new { status = "expired" }; }
            if (DateTimeOffset.UtcNow < nextPoll) return new { status = "pending", retryAfterSeconds = Math.Max(1, (int)Math.Ceiling((nextPoll-DateTimeOffset.UtcNow).TotalSeconds)) };
            nextPoll = DateTimeOffset.UtcNow.AddSeconds(pollInterval);
            code = pendingCode;
        }
        using var response = await http.PostAsync("oauth2/token", new FormUrlEncodedContent(new Dictionary<string,string>
        {
            ["client_id"] = ClientId!, ["device_code"] = code!, ["grant_type"] = "urn:ietf:params:oauth:grant-type:device_code"
        }), ct);
        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
        var root = doc.RootElement;
        if (!response.IsSuccessStatusCode)
        {
            var error = root.TryGetProperty("error", out var p) ? p.GetString() : null;
            if (error == "slow_down") { lock (gate) { pollInterval += 5; nextPoll = DateTimeOffset.UtcNow.AddSeconds(pollInterval); } }
            if (error is "authorization_pending" or "slow_down") return new { status = "pending" };
            lock (gate) pendingCode = null;
            return new { status = "failed", error = error ?? "oauth_error" };
        }
        if (!root.TryGetProperty("access_token", out var token) || string.IsNullOrEmpty(token.GetString()))
            return new { status = "failed", error = "missing_access_token" };
        var seconds = root.TryGetProperty("expires_in", out var exp) ? exp.GetInt32() : 3600;
        lock (gate)
        {
            accessToken = token.GetString();
            refreshToken = root.TryGetProperty("refresh_token", out var refresh) ? refresh.GetString() : null;
            expiresAt = DateTimeOffset.UtcNow.AddSeconds(Math.Max(0, seconds));
            pendingCode = null;
        }
        return new { status = "connected" };
    }

    public async Task<string?> GetAccessTokenAsync(CancellationToken ct)
    {
        string? current, refresh;
        lock (gate) { current = accessToken; refresh = refreshToken; if (expiresAt > DateTimeOffset.UtcNow.AddSeconds(60)) return current; }
        if (refresh is null || !Configured) return null;
        using var response = await http.PostAsync("oauth2/token", new FormUrlEncodedContent(new Dictionary<string,string>
        {
            ["client_id"] = ClientId!, ["refresh_token"] = refresh, ["grant_type"] = "refresh_token"
        }), ct);
        if (!response.IsSuccessStatusCode) return null;
        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
        var root = doc.RootElement;
        if (!root.TryGetProperty("access_token", out var token)) return null;
        lock (gate)
        {
            accessToken = token.GetString();
            if (root.TryGetProperty("refresh_token", out var newRefresh)) refreshToken = newRefresh.GetString();
            expiresAt = DateTimeOffset.UtcNow.AddSeconds(root.TryGetProperty("expires_in", out var exp) ? exp.GetInt32() : 3600);
            return accessToken;
        }
    }

    public void Disconnect() { lock (gate) { accessToken = null; refreshToken = null; pendingCode = null; expiresAt = default; } }
}
