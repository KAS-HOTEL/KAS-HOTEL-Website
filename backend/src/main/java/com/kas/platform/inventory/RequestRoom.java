package com.kas.platform.inventory;

import java.util.UUID;

/** Published room description used to price a request. Contains no stock data. */
public record RequestRoom(UUID roomTypeId, String roomTypeSlug,
                          int maxAdults, int maxChildren, int maxOccupancy) { }
