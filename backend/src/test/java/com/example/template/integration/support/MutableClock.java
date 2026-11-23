package com.example.template.integration.support;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

/**
 * The application clock in integration tests: the real time until a test fixes it. A test that
 * calls {@link #setInstant} must call {@link #reset} afterwards, because the Spring context (and
 * this clock) is shared by every integration test.
 */
public class MutableClock extends Clock {

    private volatile Clock delegate = Clock.systemUTC();

    public void setInstant(Instant instant) {
        delegate = Clock.fixed(instant, ZoneOffset.UTC);
    }

    public void reset() {
        delegate = Clock.systemUTC();
    }

    @Override
    public ZoneId getZone() {
        return ZoneOffset.UTC;
    }

    /** A snapshot in the zone: it does not follow later changes, like any clock from {@code withZone}. */
    @Override
    public Clock withZone(ZoneId zone) {
        return delegate.withZone(zone);
    }

    @Override
    public Instant instant() {
        return delegate.instant();
    }
}
