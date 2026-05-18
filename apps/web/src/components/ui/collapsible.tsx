"use client"

import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"

/**
 * An interactive component which expands/collapses a content area.
 */
const Collapsible = CollapsiblePrimitive.Root

/**
 * A button that toggles the collapsible's content.
 */
const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger

/**
 * The content of the collapsible.
 */
const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
