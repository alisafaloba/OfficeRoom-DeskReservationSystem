package com.example.template.building.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Create and update share one shape. The display position is not part of it: a new floor goes
 * last, and only the reorder endpoint moves floors.
 *
 * @param number the level as people say it: -1 for a basement, 0 for the ground floor
 */
public record FloorRequest(
        @NotBlank @Size(max = 100) String name,
        @NotNull @Min(FloorRequest.MIN_NUMBER) @Max(FloorRequest.MAX_NUMBER) Integer number) {

    public static final int MIN_NUMBER = -50;
    public static final int MAX_NUMBER = 500;
}
