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
import java.time.DayOfWeek;
import java.util.EnumSet;
import java.util.List;
import org.jspecify.annotations.Nullable;

/** The schedule must cover every weekday exactly once. */
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Constraint(validatedBy = ValidWeek.Validator.class)
public @interface ValidWeek {

    String message() default "Opening hours must contain each weekday exactly once";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    class Validator implements ConstraintValidator<ValidWeek, List<OpeningHoursDto>> {

        @Override
        public boolean isValid(@Nullable List<OpeningHoursDto> value, ConstraintValidatorContext context) {
            if (value == null) {
                return true; // presence is @NotNull's job
            }
            // A null entry or day is reported by @NotNull on the element itself.
            if (value.stream().anyMatch(entry -> entry == null || entry.dayOfWeek() == null)) {
                return true;
            }
            var days = EnumSet.noneOf(DayOfWeek.class);
            value.forEach(entry -> days.add(entry.dayOfWeek()));
            return value.size() == DayOfWeek.values().length && days.size() == value.size();
        }
    }
}
