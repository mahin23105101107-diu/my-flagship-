package io.flagship.sdk;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.flagship.shared.model.FlagModels.EnvironmentSnapshot;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Optional;

public class SnapshotStore {
    private static final Logger log = LoggerFactory.getLogger(SnapshotStore.class);
    private final Path snapshotPath;
    private final ObjectMapper objectMapper;

    public SnapshotStore(String snapshotFile, ObjectMapper objectMapper) {
        this.snapshotPath = Path.of(snapshotFile);
        this.objectMapper = objectMapper;
    }

    public void save(EnvironmentSnapshot snapshot) {
        try {
            if (snapshotPath.getParent() != null) {
                Files.createDirectories(snapshotPath.getParent());
            }
            Path tmp = snapshotPath.resolveSibling(snapshotPath.getFileName() + ".tmp");
            objectMapper.writeValue(tmp.toFile(), snapshot);
            Files.move(tmp, snapshotPath, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (Exception ex) {
            log.warn("Failed to persist FlagShip snapshot to {}: {}", snapshotPath, ex.getMessage());
        }
    }

    public Optional<EnvironmentSnapshot> load() {
        try {
            if (!Files.exists(snapshotPath)) {
                return Optional.empty();
            }
            return Optional.of(objectMapper.readValue(snapshotPath.toFile(), EnvironmentSnapshot.class));
        } catch (Exception ex) {
            log.warn("Failed to read FlagShip snapshot from {}: {}", snapshotPath, ex.getMessage());
            return Optional.empty();
        }
    }
}
