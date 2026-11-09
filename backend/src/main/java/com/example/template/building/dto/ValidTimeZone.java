package com.example.template.building.dto;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;
import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.time.DateTimeException;
import java.time.ZoneId;
import java.util.Set;
import org.jspecify.annotations.Nullable;

/** The value must be a region-based IANA zone id such as {@code Europe/Bucharest}. */
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Constraint(validatedBy = ValidTimeZone.Validator.class)
public @interface ValidTimeZone {

    String message() default "Unknown time zone";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    class Validator implements ConstraintValidator<ValidTimeZone, String> {

        private static final Set<String> AVAILABLE = ZoneId.getAvailableZoneIds();

        @Override
        public boolean isValid(@Nullable String value, ConstraintValidatorContext context) {
            if (value == null) {
                return true; // presence is @NotBlank's job
            }
            // getAvailableZoneIds() only lists region ids: it rejects "Foo/Bar" as well as the
            // offset forms ("+02:00") that ZoneId.of would accept but that have no DST rules.
            if (!AVAILABLE.contains(value)) {
                return false;
            }
            try {
                ZoneId.of(value);
                return true;
            } catch (DateTimeException e) {
                return false;
            }
        }
    }
}
