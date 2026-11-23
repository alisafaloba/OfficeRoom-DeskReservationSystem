package com.example.template.floorplan.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.template.building.repository.FloorRepository;
import com.example.template.floorplan.dto.FloorBackgroundSettingsRequest;
import com.example.template.floorplan.model.FloorBackground;
import com.example.template.floorplan.repository.FloorBackgroundRepository;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import java.util.Arrays;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

@ExtendWith(MockitoExtension.class)
@DisplayName("FloorBackgroundService")
class FloorBackgroundServiceTest {

    private static final UUID FLOOR_ID = UUID.randomUUID();
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n', 0};
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0};

    @Mock
    private FloorBackgroundRepository backgroundRepository;

    @Mock
    private FloorRepository floorRepository;

    private FloorBackgroundService service;

    @BeforeEach
    void setUp() {
        service = new FloorBackgroundService(backgroundRepository, floorRepository);
    }

    private void floorExists() {
        when(floorRepository.existsById(FLOOR_ID)).thenReturn(true);
    }

    private void saveReturnsArgument() {
        when(backgroundRepository.saveAndFlush(any(FloorBackground.class))).thenAnswer(call -> call.getArgument(0));
    }

    private static FloorBackground stored(int opacity, double cmPerPixel) {
        var background = new FloorBackground(FLOOR_ID);
        background.setContent(PNG);
        background.setContentType("image/png");
        background.setSizeBytes(PNG.length);
        background.setOpacity(opacity);
        background.setCmPerPixel(cmPerPixel);
        return background;
    }

    @Test
    @DisplayName("stores a first PNG with 50% opacity and 1 cm per pixel")
    void upload_firstImage_usesDefaults() {
        floorExists();
        when(backgroundRepository.findByFloorId(FLOOR_ID)).thenReturn(Optional.empty());
        saveReturnsArgument();

        var response = service.upload(FLOOR_ID, PNG);

        assertThat(response.contentType()).isEqualTo("image/png");
        assertThat(response.sizeBytes()).isEqualTo(PNG.length);
        assertThat(response.opacity()).isEqualTo(50);
        assertThat(response.cmPerPixel()).isEqualTo(1.0);
    }

    @Test
    @DisplayName("detects a JPEG from its bytes")
    void upload_jpeg_isDetected() {
        floorExists();
        when(backgroundRepository.findByFloorId(FLOOR_ID)).thenReturn(Optional.empty());
        saveReturnsArgument();

        assertThat(service.upload(FLOOR_ID, JPEG).contentType()).isEqualTo("image/jpeg");
    }

    @Test
    @DisplayName("replaces the bytes of an existing image and keeps its settings")
    void upload_existing_replacesBytesKeepsSettings() {
        floorExists();
        var existing = stored(20, 3.0);
        when(backgroundRepository.findByFloorId(FLOOR_ID)).thenReturn(Optional.of(existing));
        saveReturnsArgument();

        var response = service.upload(FLOOR_ID, JPEG);

        assertThat(existing.getContent()).isEqualTo(JPEG);
        assertThat(response.contentType()).isEqualTo("image/jpeg");
        assertThat(response.opacity()).isEqualTo(20);
        assertThat(response.cmPerPixel()).isEqualTo(3.0);
    }

    @Test
    @DisplayName("rejects content that is neither PNG nor JPEG, and an empty file")
    void upload_unsupported_isRejected() {
        floorExists();

        for (byte[] content : new byte[][] {"GIF89a....".getBytes(), "%PDF-1.7".getBytes(), new byte[0], {(byte) 0xFF}}) {
            assertThatThrownBy(() -> service.upload(FLOOR_ID, content))
                    .isInstanceOf(ApiException.class)
                    .extracting(e -> ((ApiException) e).errorCode())
                    .isEqualTo(ErrorCode.UNSUPPORTED_IMAGE_TYPE);
        }
        verify(backgroundRepository, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("rejects anything over 10 MB, even a valid PNG")
    void upload_tooLarge_isRejected() {
        floorExists();
        byte[] big = Arrays.copyOf(PNG, FloorBackgroundService.MAX_SIZE_BYTES + 1);

        assertThatThrownBy(() -> service.upload(FLOOR_ID, big))
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).errorCode())
                .isEqualTo(ErrorCode.IMAGE_TOO_LARGE);
    }

    @Test
    @DisplayName("answers FLOOR_NOT_FOUND for an unknown floor before looking at the file")
    void upload_unknownFloor_isRejected() {
        when(floorRepository.existsById(FLOOR_ID)).thenReturn(false);

        assertThatThrownBy(() -> service.upload(FLOOR_ID, PNG))
                .extracting(e -> ((ApiException) e).errorCode())
                .isEqualTo(ErrorCode.FLOOR_NOT_FOUND);
    }

    @Test
    @DisplayName("turns a lost race for the floor's single image into CONCURRENT_MODIFICATION")
    void upload_race_isConflict() {
        floorExists();
        when(backgroundRepository.findByFloorId(FLOOR_ID)).thenReturn(Optional.empty());
        when(backgroundRepository.saveAndFlush(any())).thenThrow(new DataIntegrityViolationException("uq"));

        assertThatThrownBy(() -> service.upload(FLOOR_ID, PNG))
                .extracting(e -> ((ApiException) e).errorCode())
                .isEqualTo(ErrorCode.CONCURRENT_MODIFICATION);
    }

    @Test
    @DisplayName("updates opacity and scale")
    void updateSettings_appliesBoth() {
        floorExists();
        var existing = stored(50, 1.0);
        when(backgroundRepository.findByFloorId(FLOOR_ID)).thenReturn(Optional.of(existing));
        saveReturnsArgument();

        var response = service.updateSettings(FLOOR_ID, new FloorBackgroundSettingsRequest(0, 2.5));

        assertThat(response.opacity()).isZero();
        assertThat(response.cmPerPixel()).isEqualTo(2.5);
    }

    @Test
    @DisplayName("answers FLOOR_BACKGROUND_NOT_FOUND when there is nothing to update, read or delete")
    void missingImage_isNotFound() {
        floorExists();
        when(backgroundRepository.findByFloorId(FLOOR_ID)).thenReturn(Optional.empty());
        when(backgroundRepository.findSettingsByFloorId(FLOOR_ID)).thenReturn(Optional.empty());
        when(backgroundRepository.findImageByFloorId(FLOOR_ID)).thenReturn(Optional.empty());

        for (Runnable call : new Runnable[] {
            () -> service.updateSettings(FLOOR_ID, new FloorBackgroundSettingsRequest(10, 1.0)),
            () -> service.delete(FLOOR_ID),
            () -> service.get(FLOOR_ID),
            () -> service.image(FLOOR_ID)
        }) {
            assertThatThrownBy(call::run)
                    .extracting(e -> ((ApiException) e).errorCode())
                    .isEqualTo(ErrorCode.FLOOR_BACKGROUND_NOT_FOUND);
        }
    }

    @Test
    @DisplayName("deletes the stored image")
    void delete_removesRow() {
        floorExists();
        var existing = stored(50, 1.0);
        when(backgroundRepository.findByFloorId(FLOOR_ID)).thenReturn(Optional.of(existing));

        service.delete(FLOOR_ID);

        verify(backgroundRepository).delete(existing);
    }
}
