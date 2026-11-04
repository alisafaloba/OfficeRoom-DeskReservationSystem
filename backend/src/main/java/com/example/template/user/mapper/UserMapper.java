package com.example.template.user.mapper;

import com.example.template.user.dto.UserPreferences;
import com.example.template.user.dto.UserResponse;
import com.example.template.user.model.User;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper
public interface UserMapper {

    /**
     * Maps the flat {@link User} entity to the {@link UserResponse} DTO, packaging the three
     * preference columns into the nested {@link UserPreferences} record.
     */
    @Mapping(
            target = "preferences",
            expression =
                    "java(new UserPreferences(user.getFavoriteDeskId(), user.getDefaultBuilding(), user.getDefaultFloor()))")
    UserResponse toResponse(User user);
}
