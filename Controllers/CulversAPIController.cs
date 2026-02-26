using Microsoft.AspNetCore.Mvc;

namespace FlavorFinder.Controllers;

[Route("api/culvers")]
public class CulversApiController(IHttpClientFactory httpClientFactory, ILogger<CulversApiController> logger) : Controller
{
    [HttpGet("locations")]
    public async Task<IActionResult> GetCulversLocations(double latitude, double longitude, int radius = 50000, int limit = 25)
    {
        if (latitude < -90 || latitude > 90)
            return BadRequest("Latitude must be between -90 and 90.");
        if (longitude < -180 || longitude > 180)
            return BadRequest("Longitude must be between -180 and 180.");
        if (radius <= 0)
            return BadRequest("Radius must be greater than 0.");
        if (limit < 1 || limit > 100)
            return BadRequest("Limit must be between 1 and 100.");

        try
        {
            using HttpClient httpClient = httpClientFactory.CreateClient("CulversApi");
            string url = $"locator/getLocations?lat={latitude}&long={longitude}&radius={radius}&limit={limit}";
            HttpResponseMessage response = await httpClient.GetAsync(url);

            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Culver's API returned {StatusCode} for locations request", response.StatusCode);
                return StatusCode(502, "Upstream API returned an error.");
            }

            string json = await response.Content.ReadAsStringAsync();
            return Content(string.IsNullOrWhiteSpace(json) ? "[]" : json, "application/json");
        }
        catch (TaskCanceledException)
        {
            logger.LogWarning("Request to Culver's locations API timed out");
            return StatusCode(504, "Upstream API request timed out.");
        }
        catch (HttpRequestException ex)
        {
            logger.LogError(ex, "Failed to reach Culver's locations API");
            return StatusCode(502, "Unable to reach upstream API.");
        }
    }

    [HttpGet("search-locations")]
    public async Task<IActionResult> GetSearchLocations(string query, double latitude = 43.293036, double longitude = -89.729234, int limit = 5)
    {
        if (string.IsNullOrWhiteSpace(query))
            return BadRequest("Query is required.");
        if (latitude < -90 || latitude > 90)
            return BadRequest("Latitude must be between -90 and 90.");
        if (longitude < -180 || longitude > 180)
            return BadRequest("Longitude must be between -180 and 180.");
        if (limit < 1 || limit > 100)
            return BadRequest("Limit must be between 1 and 100.");

        try
        {
            using HttpClient httpClient = httpClientFactory.CreateClient("CulversApi");
            string encodedQuery = Uri.EscapeDataString(query);
            string url = $"locator/getAutocompleteSuggestions?query={encodedQuery}&near={latitude},{longitude}&countryCode=US&limit={limit}&layers=postalCode,locality,state";
            HttpResponseMessage response = await httpClient.GetAsync(url);

            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Culver's API returned {StatusCode} for search request", response.StatusCode);
                return StatusCode(502, "Upstream API returned an error.");
            }

            string json = await response.Content.ReadAsStringAsync();
            return Content(string.IsNullOrWhiteSpace(json) ? "[]" : json, "application/json");
        }
        catch (TaskCanceledException)
        {
            logger.LogWarning("Request to Culver's search API timed out");
            return StatusCode(504, "Upstream API request timed out.");
        }
        catch (HttpRequestException ex)
        {
            logger.LogError(ex, "Failed to reach Culver's search API");
            return StatusCode(502, "Unable to reach upstream API.");
        }
    }
}
