package com.kas.platform.inventory;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.annotation.Scheduled;

import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * The scheduler's own three responsibilities: call the service, survive a
 * failure, and run on the cadence doc 55 §5.1 froze.
 *
 * <p>No Spring context and no database — everything here is wiring. What the
 * sweep actually does is proven against a real database in {@code HoldExpiryIT}.
 */
class HoldExpirySchedulerTest {

    @Test
    @DisplayName("the scheduled method delegates to the expiry service")
    void itDelegates() {
        CountingService service = new CountingService(false);

        new HoldExpiryScheduler(service).sweep();

        assertThat(service.calls.get()).isEqualTo(1);
    }

    @Test
    @DisplayName("a failed sweep does not kill the schedule")
    void aFailureDoesNotStopTheSchedule() {
        CountingService service = new CountingService(true);
        HoldExpiryScheduler scheduler = new HoldExpiryScheduler(service);

        // An exception escaping a @Scheduled method silently stops that schedule
        // for the life of the process. An expiry that runs late holds inventory
        // out of sale; one that never runs again holds it out forever.
        assertThatCode(scheduler::sweep).doesNotThrowAnyException();
        assertThatCode(scheduler::sweep).doesNotThrowAnyException();
        assertThat(service.calls.get()).isEqualTo(2);
    }

    @Test
    @DisplayName("stock expiry is not registered or scheduled in manual-review mode")
    void stockExpiryIsRetired() throws NoSuchMethodException {
        assertThat(HoldExpiryScheduler.class.getAnnotation(org.springframework.stereotype.Component.class)).isNull();
        assertThat(HoldExpiryScheduler.class.getMethod("sweep").getAnnotation(Scheduled.class)).isNull();
    }

    /**
     * Subclasses the service rather than mocking an interface: it has none, and
     * inventing one for a test would add an abstraction production code does not
     * need. The nulls are never dereferenced because {@link #sweep()} is
     * overridden.
     */
    private static final class CountingService extends HoldExpiryService {

        private final AtomicInteger calls = new AtomicInteger();
        private final boolean fail;

        private CountingService(boolean fail) {
            super(null, null);
            this.fail = fail;
        }

        @Override
        public int sweep() {
            calls.incrementAndGet();
            if (fail) {
                throw new IllegalStateException("the database is unreachable");
            }
            return 3;
        }
    }

}
