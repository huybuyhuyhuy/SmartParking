package com.smartparking.auth.api;

import com.smartparking.auth.security.JwtService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final JwtService jwtService;

    public AuthController(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(@RequestBody LoginRequest request) {
        String token = jwtService.generateToken(request.username(), request.role());
        return ResponseEntity.ok(Map.of("accessToken", token, "tokenType", "Bearer"));
    }

    public record LoginRequest(String username, String role) {}
}
