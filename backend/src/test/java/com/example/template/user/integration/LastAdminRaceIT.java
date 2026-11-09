package com.example.template.user.integration;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.template.integration.AbstractIntegrationTest;
import com.example.template.integration.support.AuthApiClient;
import com.example.template.integration.support.UserApiClient;
import com.github.database.rider.core.api.dataset.DataSet;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

/**
 * Two admins deactivating each other at the same moment must never leave the system without an
 * active admin. Without a lock around the "last active admin" check, both requests read a count
 * of two and both succeed.
 */
@DataSet("datasets/last-admin-race-users.yml")
@DisplayName("Last admin race")
class LastAdminRaceIT extends AbstractIntegrationTest {

    private static final String PASSWORD = "Password123!";
    private static final String ADMIN_A_EMAIL = "race-admin-a@test.local";
    private static final String ADMIN_B_EMAIL = "race-admin-b@test.local";
    private static final UUID ADMIN_A_ID = UUID.fromString("eeeeeeee-0000-0000-0000-000000000001");
    private static final UUID ADMIN_B_ID = UUID.fromString("eeeeeeee-0000-0000-0000-000000000002");

    private AuthApiClient authApi;
    private UserApiClient userApi;

    @BeforeEach
    void setUp() {
        authApi = new AuthApiClient(restTemplate);
        userApi = new UserApiClient(restTemplate);
    }

    @Test
    @DisplayName("two admins deactivating each other concurrently: one succeeds, the other gets 409")
    void deactivate_eachOtherConcurrently_keepsOneActiveAdmin() throws Exception {
        String tokenA = authApi.accessTokenFor(ADMIN_A_EMAIL, PASSWORD);
        String tokenB = authApi.accessTokenFor(ADMIN_B_EMAIL, PASSWORD);

        var start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Callable<HttpStatus> aDeactivatesB = () -> {
                start.await();
                return HttpStatus.valueOf(userApi.deactivate(tokenA, ADMIN_B_ID.toString()).getStatusCode().value());
            };
            Callable<HttpStatus> bDeactivatesA = () -> {
                start.await();
                return HttpStatus.valueOf(userApi.deactivate(tokenB, ADMIN_A_ID.toString()).getStatusCode().value());
            };
            Future<HttpStatus> first = pool.submit(aDeactivatesB);
            Future<HttpStatus> second = pool.submit(bDeactivatesA);
            start.countDown();

            List<HttpStatus> statuses = List.of(first.get(30, TimeUnit.SECONDS), second.get(30, TimeUnit.SECONDS));

            assertThat(statuses).containsExactlyInAnyOrder(HttpStatus.OK, HttpStatus.CONFLICT);
        } finally {
            pool.shutdownNow();
        }
    }
}
