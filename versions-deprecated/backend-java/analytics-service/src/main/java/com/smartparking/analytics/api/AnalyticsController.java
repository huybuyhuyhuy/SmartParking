package com.smartparking.analytics.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/admin")
public class AnalyticsController {
    @GetMapping("/dashboard")
    public Map<String, Object> dashboard() {
        return Map.of(
                "activeLots", 38,
                "occupancyRate", 0.72,
                "avgSearchSeconds", 34,
                "totalDailySessions", 12490
        );
    }

    @GetMapping("/heatmap")
    public List<Map<String, Object>> heatmap() {
        return List.of(
                Map.of("lat", -6.204, "lng", 106.845, "intensity", 0.82),
                Map.of("lat", -6.208, "lng", 106.843, "intensity", 0.67),
                Map.of("lat", -6.201, "lng", 106.851, "intensity", 0.91)
        );
    }
}
