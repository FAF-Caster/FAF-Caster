using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;

namespace FAFCaster.Bridge;

/// <summary>
/// Read-only FAF API probe. Never reads credentials from the FAF client.
/// Authentication, if needed, must use a separately authorised OAuth flow.
/// </summary>
public sealed class FafApiClient(HttpClient http)
{
    public const string DefaultBaseUrl = "https://api.faforever.com/";

    public async Task<FafApiProbeResult> ProbeGameAsync(long gameId, CancellationToken cancellationToken = default)
    {
        if (gameId <= 0) return new(false, null, "invalid_game_id", null);
        using var request = new HttpRequestMessage(HttpMethod.Get,
            $"data/game/{gameId}");
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.api+json"));
        try
        {
            using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
                return new(false, (int)response.StatusCode, "authentication_required", null);
            if (response.StatusCode == HttpStatusCode.NotFound)
                return new(false, 404, "game_not_found", null);
            if (!response.IsSuccessStatusCode)
                return new(false, (int)response.StatusCode, "api_unavailable", null);
            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var json = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            if (!json.RootElement.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Object)
                return new(false, (int)response.StatusCode, "unexpected_response", null);
            var id = data.TryGetProperty("id", out var value) ? value.ToString() : null;
            return new(true, (int)response.StatusCode, null, id);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return new(false, null, "timeout", null);
        }
        catch (HttpRequestException)
        {
            return new(false, null, "network_error", null);
        }
        catch (JsonException)
        {
            return new(false, null, "invalid_json", null);
        }
    }
}

public sealed record FafApiProbeResult(bool Success, int? HttpStatus, string? Error, string? GameId);
