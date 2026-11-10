package com.example.template.building.repository;

import com.example.template.building.model.Floor;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface FloorRepository extends JpaRepository<Floor, UUID> {

    /** Display order; floors that share a position (a concurrent add) fall back to their number. */
    List<Floor> findByBuildingIdOrderBySortOrderAscNumberAsc(UUID buildingId);

    Optional<Floor> findByIdAndBuildingId(UUID id, UUID buildingId);

    boolean existsByBuildingIdAndNumber(UUID buildingId, int number);

    boolean existsByBuildingIdAndNumberAndIdNot(UUID buildingId, int number, UUID id);

    long countByBuildingId(UUID buildingId);

    /** The next free display position: one past the last floor, 0 for an empty building. */
    @Query("select coalesce(max(f.sortOrder) + 1, 0) from Floor f where f.buildingId = :buildingId")
    int nextSortOrder(UUID buildingId);

    /** Floor counts for many buildings in one query; buildings without floors are absent. */
    @Query("select f.buildingId as buildingId, count(f) as floorCount from Floor f"
            + " where f.buildingId in :buildingIds group by f.buildingId")
    List<FloorCount> countByBuildingIds(Collection<UUID> buildingIds);

    interface FloorCount {
        UUID getBuildingId();

        long getFloorCount();
    }
}
