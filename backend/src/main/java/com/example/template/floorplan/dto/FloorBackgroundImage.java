package com.example.template.floorplan.dto;

/**
 * The stored image bytes with their detected media type. {@code version} changes with every
 * write and serves as the download's ETag.
 */
public record FloorBackgroundImage(byte[] content, String contentType, Long version) {}
