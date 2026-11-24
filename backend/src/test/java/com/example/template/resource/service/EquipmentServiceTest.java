package com.example.template.resource.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.example.template.resource.dto.EquipmentRequest;
import com.example.template.resource.dto.EquipmentResponse;
import com.example.template.resource.model.Equipment;
import com.example.template.resource.repository.EquipmentRepository;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
@DisplayName("EquipmentService")
class EquipmentServiceTest {

    @Mock
    private EquipmentRepository equipmentRepository;

    private EquipmentService equipmentService;

    @BeforeEach
    void setUp() {
        equipmentService = new EquipmentService(equipmentRepository);
    }

    private static Equipment equipment(String name) {
        Equipment eq = new Equipment();
        eq.setName(name);
        ReflectionTestUtils.setField(eq, "id", UUID.randomUUID());
        return eq;
    }

    @Test
    @DisplayName("list returns equipment in ascending order")
    void list_returnsOrderedEquipment() {
        when(equipmentRepository.findAllByOrderByNameAsc())
                .thenReturn(List.of(equipment("docking station"), equipment("monitor")));

        List<EquipmentResponse> result = equipmentService.list();

        assertThat(result).hasSize(2);
        assertThat(result.get(0).name()).isEqualTo("docking station");
        assertThat(result.get(1).name()).isEqualTo("monitor");
    }

    @Test
    @DisplayName("create saves and returns new equipment")
    void create_savesNewEquipment() {
        when(equipmentRepository.existsByNameIgnoreCase("Webcam")).thenReturn(false);
        when(equipmentRepository.saveAndFlush(any(Equipment.class)))
                .thenAnswer(invocation -> {
                    Equipment eq = invocation.getArgument(0);
                    ReflectionTestUtils.setField(eq, "id", UUID.randomUUID());
                    return eq;
                });

        EquipmentResponse response = equipmentService.create(new EquipmentRequest(" Webcam "));

        assertThat(response.name()).isEqualTo("Webcam");
    }

    @Test
    @DisplayName("create throws EQUIPMENT_NAME_ALREADY_IN_USE when name already exists")
    void create_duplicateNameThrows() {
        when(equipmentRepository.existsByNameIgnoreCase("Monitor")).thenReturn(true);

        assertThatThrownBy(() -> equipmentService.create(new EquipmentRequest("Monitor")))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).errorCode()).isEqualTo(ErrorCode.EQUIPMENT_NAME_ALREADY_IN_USE));
    }
}
