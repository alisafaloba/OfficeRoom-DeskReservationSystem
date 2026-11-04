package com.example.template.user.repository;

import com.example.template.shared.security.Role;
import com.example.template.user.model.User;
import java.util.ArrayList;
import org.jspecify.annotations.Nullable;
import org.springframework.data.jpa.domain.Specification;

/** Building blocks of the admin user search; every filter is optional and they combine with AND. */
public final class UserSpecifications {

    private UserSpecifications() {}

    public static Specification<User> matching(
            @Nullable String query, @Nullable Role role, @Nullable Boolean active, @Nullable String department) {
        return (root, criteriaQuery, cb) -> {
            var predicates = new ArrayList<jakarta.persistence.criteria.Predicate>();
            if (query != null && !query.isBlank()) {
                String pattern = "%" + escapeLike(query.trim().toLowerCase()) + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("email")), pattern, '\\'),
                        cb.like(cb.lower(root.get("firstName")), pattern, '\\'),
                        cb.like(cb.lower(root.get("lastName")), pattern, '\\')));
            }
            if (role != null) {
                predicates.add(cb.equal(root.get("role"), role));
            }
            if (active != null) {
                predicates.add(cb.equal(root.get("active"), active));
            }
            if (department != null && !department.isBlank()) {
                predicates.add(cb.equal(cb.lower(root.get("department")), department.trim().toLowerCase()));
            }
            return cb.and(predicates.toArray(new jakarta.persistence.criteria.Predicate[0]));
        };
    }

    /** Makes the user's text literal inside a LIKE pattern. */
    private static String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
