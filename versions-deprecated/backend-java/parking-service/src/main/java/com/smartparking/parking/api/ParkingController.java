package com.smartparking.parking.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1")
public class ParkingController {
    private final List<ParkingLotDto> lots = List.of(
            new ParkingLotDto("P001", "Central Mall", -6.2040, 106.8451, true, 2.5, 120, 34),
            new ParkingLotDto("P002", "Riverside Office", -6.2082, 106.8429, false, 1.8, 80, 7),
            new ParkingLotDto("P003", "Transit Hub", -6.2010, 106.8515, true, 1.2, 220, 103)
    );

    @GetMapping("/parking-lots")
    public List<ParkingLotDto> allParkingLots() {
        return lots;
    }

    @GetMapping("/nearby")
    public List<ParkingLotDto> nearby(
            @RequestParam double lat,
            @RequestParam double lng,
            @RequestParam(defaultValue = "3000") int radius,
            @RequestParam(defaultValue = "false") boolean evOnly,
            @RequestParam(required = false) Double maxPrice
    ) {
        return lots.stream()
                .filter(lot -> !evOnly || lot.evSupported())
                .filter(lot -> maxPrice == null || lot.pricePerHour() <= maxPrice)
                .filter(lot -> distanceMeters(lat, lng, lot.lat(), lot.lng()) <= radius)
                .toList();
    }

    private double distanceMeters(double lat1, double lng1, double lat2, double lng2) {
        double r = 6_371_000;
        double p1 = Math.toRadians(lat1);
        double p2 = Math.toRadians(lat2);
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    public record ParkingLotDto(
            String id,
            String name,
            double lat,
            double lng,
            boolean evSupported,
            double pricePerHour,
            int totalSlots,
            int availableSlots
    ) {}
}
