package com.example.template.building.model;

import com.example.template.shared.model.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "equipment_catalogue")
@Getter
@Setter
@NoArgsConstructor
public class Equipment extends BaseEntity {

    @Column(nullable = false, unique = true, length = 255)
    private String name;

}