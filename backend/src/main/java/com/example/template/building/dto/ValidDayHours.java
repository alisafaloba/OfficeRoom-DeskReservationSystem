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
import org.jspecify.annotations.Nullable;

/**
 * A day is either closed (both times absent) or open with an opening time strictly before its
 * closing time.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Constraint(validatedBy = ValidDayHours.Validator.class)
public @interface ValidDayHours {

    String message() default "Give both an opening and a closing time (closing after opening), or neither for a closed day";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    class Validator implements ConstraintValidator<ValidDayHours, OpeningHoursDto> {

        @Override
        public boolean isValid(@Nullable OpeningHoursDto value, ConstraintValidatorContext context) {
            if (value == null) {
                return true;
            }
            boolean valid = (value.opensAt() == null && value.closesAt() == null)
                    || (value.opensAt() != null
                            && value.closesAt() != null
                            && value.opensAt().isBefore(value.closesAt()));
            if (!valid) {
                // Reported on closesAt so the client can show it next to the field.
                context.disableDefaultConstraintViolation();
                context.buildConstraintViolationWithTemplate(context.getDefaultConstraintMessageTemplate())
                        .addPropertyNode("closesAt")
                        .addConstraintViolation();
            }
            return valid;
        }
    }
}
