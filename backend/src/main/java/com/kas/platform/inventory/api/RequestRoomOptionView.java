package com.kas.platform.inventory.api;

import com.kas.platform.shared.Money;

/** A price estimate for a published room; availability is checked by hotel staff. */
public record RequestRoomOptionView(String roomTypeSlug, String name, Money nightlyFrom) { }
