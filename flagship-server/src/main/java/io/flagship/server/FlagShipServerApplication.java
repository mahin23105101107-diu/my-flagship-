package io.flagship.server;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class FlagShipServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(FlagShipServerApplication.class, args);
    }
}
