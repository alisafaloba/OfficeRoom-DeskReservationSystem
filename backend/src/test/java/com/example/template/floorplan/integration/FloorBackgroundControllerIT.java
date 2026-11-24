package com.example.template.floorplan.integration;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.template.integration.AbstractIntegrationTest;
import com.example.template.integration.support.AuthApiClient;
import com.example.template.integration.support.BuildingApiClient;
import com.example.template.integration.support.FloorApiClient;
import com.example.template.integration.support.FloorBackgroundApiClient;
import com.example.template.integration.support.TestUsers;
import com.github.database.rider.core.api.dataset.DataSet;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

/**
 * E3.T6 acceptance criteria end to end. Every test uses a floor of its own, so the shared
 * database needs no cleanup. No {@code @Nested} groups: see UserControllerIT for why.
 */
@DataSet("datasets/floor-background-users.yml")
@DisplayName("Floor background API")
class FloorBackgroundControllerIT extends AbstractIntegrationTest {

    private static final byte[] PNG = FloorBackgroundApiClient.PNG;
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 0x10};
    private static final int TEN_MB = 10 * 1024 * 1024;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private FloorBackgroundApiClient backgroundApi;
    private String adminToken;
    private String employeeToken;
    private String floorId;

    @BeforeEach
    void setUp() {
        var authApi = new AuthApiClient(restTemplate);
        backgroundApi = new FloorBackgroundApiClient(restTemplate);
        adminToken = authApi.accessTokenFor(TestUsers.BACKGROUND_ADMIN_EMAIL, TestUsers.PASSWORD);
        employeeToken = authApi.accessTokenFor(TestUsers.BACKGROUND_EMPLOYEE_EMAIL, TestUsers.PASSWORD);
        floorId = createFloor();
    }

    private String createFloor() {
        var building = new BuildingApiClient(restTemplate)
                .create(adminToken, BuildingApiClient.body("Backgrounds " + UUID.randomUUID(), "UTC"));
        assertThat(building.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        var floor = new FloorApiClient(restTemplate)
                .create(adminToken, bodyOf(building).get("id").asString(), FloorApiClient.body("Ground", 0));
        assertThat(floor.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        return bodyOf(floor).get("id").asString();
    }

    private static String code(ResponseEntity<JsonNode> response) {
        return bodyOf(response).get("code").asString();
    }

    private int storedRows() {
        Integer rows = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM floor_backgrounds WHERE floor_id = ?::uuid", Integer.class, floorId);
        return rows == null ? 0 : rows;
    }

    @Test
    @DisplayName("stores a PNG with default settings and serves it back byte for byte")
    void upload_png_isStoredAndDownloadable() {
        var upload = backgroundApi.upload(adminToken, floorId, PNG, "plan.png");

        assertThat(upload.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(bodyOf(upload).get("contentType").asString()).isEqualTo("image/png");
        assertThat(bodyOf(upload).get("sizeBytes").asInt()).isEqualTo(PNG.length);
        assertThat(bodyOf(upload).get("opacity").asInt()).isEqualTo(50);
        assertThat(bodyOf(upload).get("cmPerPixel").asDouble()).isEqualTo(1.0);

        var image = backgroundApi.image(employeeToken, floorId);
        assertThat(image.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(image.getHeaders().getContentType()).isEqualTo(MediaType.IMAGE_PNG);
        assertThat(image.getHeaders().getFirst("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(image.getBody()).isEqualTo(PNG);
    }

    @Test
    @DisplayName("accepts a JPEG whatever its file name says")
    void upload_jpegWithWrongExtension_isStoredAsJpeg() {
        var upload = backgroundApi.upload(adminToken, floorId, JPEG, "plan.png");

        assertThat(upload.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(bodyOf(upload).get("contentType").asString()).isEqualTo("image/jpeg");
    }

    @Test
    @DisplayName("rejects a file that only claims to be an image with 400 UNSUPPORTED_IMAGE_TYPE")
    void upload_renamedNonImage_returns400() {
        byte[] pdf = "%PDF-1.7 not an image".getBytes();

        var upload = backgroundApi.upload(adminToken, floorId, pdf, "plan.png");

        assertThat(upload.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(code(upload)).isEqualTo("UNSUPPORTED_IMAGE_TYPE");
        assertThat(storedRows()).isZero();
    }

    @Test
    @DisplayName("accepts exactly 10 MB and rejects anything bigger with 400 IMAGE_TOO_LARGE")
    void upload_sizeLimit_isTenMegabytes() {
        byte[] atLimit = Arrays.copyOf(PNG, TEN_MB);
        byte[] overLimit = Arrays.copyOf(PNG, TEN_MB + 1);

        assertThat(backgroundApi.upload(adminToken, floorId, atLimit, "big.png").getStatusCode())
                .isEqualTo(HttpStatus.OK);
        var tooBig = backgroundApi.upload(adminToken, floorId, overLimit, "huge.png");
        assertThat(tooBig.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(code(tooBig)).isEqualTo("IMAGE_TOO_LARGE");
    }

    @Test
    @DisplayName("replaces the image in place and keeps the settings")
    void upload_twice_replacesTheImage() {
        backgroundApi.upload(adminToken, floorId, PNG, "first.png");
        backgroundApi.updateSettings(adminToken, floorId, FloorBackgroundApiClient.settings(30, 2.5));

        var replaced = backgroundApi.upload(adminToken, floorId, JPEG, "second.jpg");

        assertThat(replaced.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(bodyOf(replaced).get("contentType").asString()).isEqualTo("image/jpeg");
        assertThat(bodyOf(replaced).get("opacity").asInt()).isEqualTo(30);
        assertThat(storedRows()).isEqualTo(1);
        assertThat(backgroundApi.image(adminToken, floorId).getBody()).isEqualTo(JPEG);
    }

    @Test
    @DisplayName("saves opacity from 0 to 100 percent and the scale")
    void updateSettings_savesOpacityAndScale() {
        backgroundApi.upload(adminToken, floorId, PNG, "plan.png");

        assertThat(backgroundApi.updateSettings(adminToken, floorId, FloorBackgroundApiClient.settings(0, 1))
                        .getStatusCode())
                .isEqualTo(HttpStatus.OK);
        backgroundApi.updateSettings(adminToken, floorId, FloorBackgroundApiClient.settings(100, 0.5));

        var settings = bodyOf(backgroundApi.get(employeeToken, floorId));
        assertThat(settings.get("opacity").asInt()).isEqualTo(100);
        assertThat(settings.get("cmPerPixel").asDouble()).isEqualTo(0.5);
    }

    @Test
    @DisplayName("rejects opacity outside 0-100 and a scale that is not positive with 400")
    void updateSettings_outOfRange_returns400() {
        backgroundApi.upload(adminToken, floorId, PNG, "plan.png");

        var invalid = List.of(
                FloorBackgroundApiClient.settings(101, 1),
                FloorBackgroundApiClient.settings(-1, 1),
                FloorBackgroundApiClient.settings(50, 0));
        for (var body : invalid) {
            var response = backgroundApi.updateSettings(adminToken, floorId, body);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(code(response)).isEqualTo("VALIDATION_FAILED");
        }
    }

    @Test
    @DisplayName("removing the image deletes the stored file")
    void delete_removesTheStoredFile() {
        backgroundApi.upload(adminToken, floorId, PNG, "plan.png");

        assertThat(backgroundApi.delete(adminToken, floorId).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

        assertThat(storedRows()).isZero();
        var after = backgroundApi.get(adminToken, floorId);
        assertThat(after.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(code(after)).isEqualTo("FLOOR_BACKGROUND_NOT_FOUND");
        assertThat(backgroundApi.image(adminToken, floorId).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    @DisplayName("tells a floor without an image apart from an unknown floor")
    void get_missing_returnsDistinct404s() {
        var noImage = backgroundApi.get(employeeToken, floorId);
        var noFloor = backgroundApi.get(employeeToken, UUID.randomUUID().toString());

        assertThat(code(noImage)).isEqualTo("FLOOR_BACKGROUND_NOT_FOUND");
        assertThat(code(noFloor)).isEqualTo("FLOOR_NOT_FOUND");
    }

    @Test
    @DisplayName("denies an employee every write with 403 and anonymous callers every read with 401")
    void access_isEnforced() {
        backgroundApi.upload(adminToken, floorId, PNG, "plan.png");

        assertThat(backgroundApi.upload(employeeToken, floorId, PNG, "plan.png").getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(backgroundApi.updateSettings(employeeToken, floorId, FloorBackgroundApiClient.settings(10, 1))
                        .getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(backgroundApi.delete(employeeToken, floorId).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(backgroundApi.get(null, floorId).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(backgroundApi.image(null, floorId).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(storedRows()).isEqualTo(1);
    }

    @Test
    @DisplayName("goes with its floor when the floor is deleted")
    void deletingTheFloor_removesTheBackground() {
        backgroundApi.upload(adminToken, floorId, PNG, "plan.png");

        jdbcTemplate.update("DELETE FROM floors WHERE id = ?::uuid", floorId);

        assertThat(storedRows()).isZero();
    }

    @Test
    @DisplayName("lets the browser revalidate the image: 304 without the bytes until the image changes")
    void image_conditionalRequest_answers304UntilReplaced() {
        backgroundApi.upload(adminToken, floorId, PNG, "plan.png");
        var first = backgroundApi.image(adminToken, floorId);
        String etag = first.getHeaders().getETag();
        assertThat(etag).isNotBlank();

        var unchanged = backgroundApi.image(adminToken, floorId, etag);
        assertThat(unchanged.getStatusCode()).isEqualTo(HttpStatus.NOT_MODIFIED);
        assertThat(unchanged.getBody()).isNull();

        backgroundApi.upload(adminToken, floorId, JPEG, "new.jpg");
        var replaced = backgroundApi.image(adminToken, floorId, etag);
        assertThat(replaced.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(replaced.getBody()).isEqualTo(JPEG);
        assertThat(replaced.getHeaders().getETag()).isNotEqualTo(etag);
    }

    @Test
    @DisplayName("saves settings without changing the image, and answers 404 for a second delete")
    void settingsAndDelete_workWithoutLoadingTheImage() {
        backgroundApi.upload(adminToken, floorId, PNG, "plan.png");

        var updated = backgroundApi.updateSettings(adminToken, floorId, FloorBackgroundApiClient.settings(25, 3));
        assertThat(updated.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(bodyOf(updated).get("opacity").asInt()).isEqualTo(25);
        assertThat(bodyOf(updated).get("cmPerPixel").asDouble()).isEqualTo(3.0);
        assertThat(backgroundApi.image(adminToken, floorId).getBody()).isEqualTo(PNG);

        assertThat(backgroundApi.delete(adminToken, floorId).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        var again = backgroundApi.delete(adminToken, floorId);
        assertThat(again.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(code(again)).isEqualTo("FLOOR_BACKGROUND_NOT_FOUND");
    }

    @Test
    @DisplayName("places a new image at the origin, unrotated and visible, and saves a new placement")
    void placement_defaultsAndIsSaved() {
        var upload = bodyOf(backgroundApi.upload(adminToken, floorId, PNG, "plan.png"));
        assertThat(upload.get("offsetX").asDouble()).isZero();
        assertThat(upload.get("offsetY").asDouble()).isZero();
        assertThat(upload.get("rotation").asInt()).isZero();
        assertThat(upload.get("visible").asBoolean()).isTrue();

        var placed = backgroundApi.updateSettings(
                adminToken, floorId, FloorBackgroundApiClient.settings(60, 2, 150.5, -320, 270, false));
        assertThat(placed.getStatusCode()).isEqualTo(HttpStatus.OK);

        var settings = bodyOf(backgroundApi.get(employeeToken, floorId));
        assertThat(settings.get("offsetX").asDouble()).isEqualTo(150.5);
        assertThat(settings.get("offsetY").asDouble()).isEqualTo(-320.0);
        assertThat(settings.get("rotation").asInt()).isEqualTo(270);
        assertThat(settings.get("visible").asBoolean()).isFalse();
        assertThat(backgroundApi.image(adminToken, floorId).getBody()).isEqualTo(PNG);
    }

    @Test
    @DisplayName("accepts only quarter turns and offsets within 1 km, and needs every field")
    void placement_invalid_returns400() {
        backgroundApi.upload(adminToken, floorId, PNG, "plan.png");

        var invalid = List.of(
                FloorBackgroundApiClient.settings(50, 1, 0, 0, 45, true),
                FloorBackgroundApiClient.settings(50, 1, 0, 0, 360, true),
                FloorBackgroundApiClient.settings(50, 1, 0, 0, -90, true),
                FloorBackgroundApiClient.settings(50, 1, 100_001, 0, 0, true),
                java.util.Map.<String, Object>of("opacity", 50, "cmPerPixel", 1));
        for (var body : invalid) {
            var response = backgroundApi.updateSettings(adminToken, floorId, body);
            assertThat(response.getStatusCode()).as("%s", body).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(code(response)).isEqualTo("VALIDATION_FAILED");
        }
    }
}
