package com.smartparking.slot.api;

import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/api/v1/slots")
public class SlotController {
    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final SimpMessagingTemplate ws;
    private final Map<String, Integer> availability = new ConcurrentHashMap<>();

    public SlotController(KafkaTemplate<String, Object> kafkaTemplate, SimpMessagingTemplate ws) {
        this.kafkaTemplate = kafkaTemplate;
        this.ws = ws;
    }

    @PostMapping("/events")
    public Map<String, Object> ingestEvent(@RequestBody SlotEvent event) {
        availability.put(event.parkingLotId(), event.availableSlots());
        kafkaTemplate.send("slot-events", event.parkingLotId(), event);
        ws.convertAndSend("/topic/slots/" + event.parkingLotId(), event);
        return Map.of("status", "accepted", "timestamp", Instant.now().toString());
    }

    @PostMapping("/override")
    public Map<String, Integer> manualOverride(@RequestParam String parkingLotId, @RequestParam int availableSlots) {
        availability.put(parkingLotId, availableSlots);
        SlotEvent event = new SlotEvent(parkingLotId, availableSlots, "MANUAL_OVERRIDE");
        kafkaTemplate.send("slot-events", parkingLotId, event);
        ws.convertAndSend("/topic/slots/" + parkingLotId, event);
        return Map.of(parkingLotId, availableSlots);
    }

    @GetMapping
    public Map<String, Integer> getCurrent() {
        return availability;
    }

    public record SlotEvent(String parkingLotId, int availableSlots, String source) {}
}
