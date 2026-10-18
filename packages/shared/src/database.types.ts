
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "agent_profiles": {
                  Row: {
                    "agency_name": string | null,"bio": string | null,"created_at": string,"is_public": boolean,"licence_reference": string | null,"public_email": string | null,"public_phone": string | null,"updated_at": string,"user_id": string,"whatsapp": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "agency_name"?: string | null,"bio"?: string | null,"created_at"?: string,"is_public"?: boolean,"licence_reference"?: string | null,"public_email"?: string | null,"public_phone"?: string | null,"updated_at"?: string,"user_id": string,"whatsapp"?: string | null
                  }
                  Update: {
                    "agency_name"?: string | null,"bio"?: string | null,"created_at"?: string,"is_public"?: boolean,"licence_reference"?: string | null,"public_email"?: string | null,"public_phone"?: string | null,"updated_at"?: string,"user_id"?: string,"whatsapp"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_profiles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"amenities": {
                  Row: {
                    "category": string | null,"created_at": string,"id": string,"is_active": boolean,"name": string,"slug": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"slug": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "category"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"slug"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"after": Json | null,"before": Json | null,"created_at": string,"entity_id": string | null,"entity_type": string,"id": number,"ip_hash": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"id"?: never,"ip_hash"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: never,"ip_hash"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"comparison_items": {
                  Row: {
                    "created_at": string,"listing_id": string,"position": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"listing_id": string,"position"?: number,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"listing_id"?: string,"position"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "comparison_items_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comparison_items_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"content_pages": {
                  Row: {
                    "body_markdown": string,"is_published": boolean,"slug": string,"title": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body_markdown"?: string,"is_published"?: boolean,"slug": string,"title": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "body_markdown"?: string,"is_published"?: boolean,"slug"?: string,"title"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_pages_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"currencies": {
                  Row: {
                    "code": string,"is_enabled": boolean,"minor_units": number,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"is_enabled"?: boolean,"minor_units"?: number,"name": string
                  }
                  Update: {
                    "code"?: string,"is_enabled"?: boolean,"minor_units"?: number,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"data_requests": {
                  Row: {
                    "completed_at": string | null,"handled_by": string | null,"id": string,"kind": Database["public"]['Enums']["data_request_kind"],"notes": string | null,"requested_at": string,"status": Database["public"]['Enums']["data_request_status"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"handled_by"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["data_request_kind"],"notes"?: string | null,"requested_at"?: string,"status"?: Database["public"]['Enums']["data_request_status"],"user_id": string
                  }
                  Update: {
                    "completed_at"?: string | null,"handled_by"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["data_request_kind"],"notes"?: string | null,"requested_at"?: string,"status"?: Database["public"]['Enums']["data_request_status"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "data_requests_handled_by_fkey"
      columns: ["handled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "data_requests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"enquiries": {
                  Row: {
                    "assigned_to": string | null,"consent_text_version": string | null,"created_at": string,"email": string,"handled_at": string | null,"handled_by": string | null,"id": string,"ip_hash": string | null,"kind": Database["public"]['Enums']["enquiry_kind"],"listing_id": string,"message": string,"name": string,"phone": string | null,"requested_timezone": string | null,"requested_visit_at": string | null,"sender_user_id": string | null,"status": Database["public"]['Enums']["enquiry_status"],"updated_at": string,"visit_status": Database["public"]['Enums']["visit_status"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_to"?: string | null,"consent_text_version"?: string | null,"created_at"?: string,"email": string,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"ip_hash"?: string | null,"kind"?: Database["public"]['Enums']["enquiry_kind"],"listing_id": string,"message": string,"name": string,"phone"?: string | null,"requested_timezone"?: string | null,"requested_visit_at"?: string | null,"sender_user_id"?: string | null,"status"?: Database["public"]['Enums']["enquiry_status"],"updated_at"?: string,"visit_status"?: Database["public"]['Enums']["visit_status"] | null
                  }
                  Update: {
                    "assigned_to"?: string | null,"consent_text_version"?: string | null,"created_at"?: string,"email"?: string,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"ip_hash"?: string | null,"kind"?: Database["public"]['Enums']["enquiry_kind"],"listing_id"?: string,"message"?: string,"name"?: string,"phone"?: string | null,"requested_timezone"?: string | null,"requested_visit_at"?: string | null,"sender_user_id"?: string | null,"status"?: Database["public"]['Enums']["enquiry_status"],"updated_at"?: string,"visit_status"?: Database["public"]['Enums']["visit_status"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "enquiries_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "enquiries_handled_by_fkey"
      columns: ["handled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "enquiries_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "enquiries_sender_user_id_fkey"
      columns: ["sender_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"favorites": {
                  Row: {
                    "created_at": string,"listing_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"listing_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"listing_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "favorites_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "favorites_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"homepage_sections": {
                  Row: {
                    "body": string | null,"id": string,"is_active": boolean,"kind": string,"sort_order": number,"title": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"id"?: string,"is_active"?: boolean,"kind": string,"sort_order"?: number,"title"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string | null,"id"?: string,"is_active"?: boolean,"kind"?: string,"sort_order"?: number,"title"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"job_queue": {
                  Row: {
                    "attempts": number,"created_at": string,"finished_at": string | null,"id": number,"kind": string,"last_error": string | null,"listing_id": string,"next_attempt_at": string,"status": Database["public"]['Enums']["outbox_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"finished_at"?: string | null,"id"?: never,"kind": string,"last_error"?: string | null,"listing_id": string,"next_attempt_at"?: string,"status"?: Database["public"]['Enums']["outbox_status"]
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"finished_at"?: string | null,"id"?: never,"kind"?: string,"last_error"?: string | null,"listing_id"?: string,"next_attempt_at"?: string,"status"?: Database["public"]['Enums']["outbox_status"]
                  }
                  Relationships: [
                    
                  ]
                },"landing_pages": {
                  Row: {
                    "created_at": string,"id": string,"intro": string | null,"is_indexable": boolean,"is_published": boolean,"location_id": string | null,"property_type_id": string | null,"purpose": Database["public"]['Enums']["listing_purpose"] | null,"slug": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"intro"?: string | null,"is_indexable"?: boolean,"is_published"?: boolean,"location_id"?: string | null,"property_type_id"?: string | null,"purpose"?: Database["public"]['Enums']["listing_purpose"] | null,"slug": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"intro"?: string | null,"is_indexable"?: boolean,"is_published"?: boolean,"location_id"?: string | null,"property_type_id"?: string | null,"purpose"?: Database["public"]['Enums']["listing_purpose"] | null,"slug"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "landing_pages_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "landing_pages_property_type_id_fkey"
      columns: ["property_type_id"]
isOneToOne: false
      referencedRelation: "property_types"
      referencedColumns: ["id"]
    }
                  ]
                },"listing_amenities": {
                  Row: {
                    "amenity_id": string,"listing_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amenity_id": string,"listing_id": string
                  }
                  Update: {
                    "amenity_id"?: string,"listing_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "listing_amenities_amenity_id_fkey"
      columns: ["amenity_id"]
isOneToOne: false
      referencedRelation: "amenities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listing_amenities_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    }
                  ]
                },"listing_media": {
                  Row: {
                    "alt_text": string | null,"bytes": number | null,"created_at": string,"height": number | null,"id": string,"is_cover": boolean,"kind": Database["public"]['Enums']["media_kind"],"listing_id": string,"mime_type": string | null,"public_key": string | null,"sort_order": number,"upload_key": string,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "alt_text"?: string | null,"bytes"?: number | null,"created_at"?: string,"height"?: number | null,"id"?: string,"is_cover"?: boolean,"kind"?: Database["public"]['Enums']["media_kind"],"listing_id": string,"mime_type"?: string | null,"public_key"?: string | null,"sort_order"?: number,"upload_key": string,"width"?: number | null
                  }
                  Update: {
                    "alt_text"?: string | null,"bytes"?: number | null,"created_at"?: string,"height"?: number | null,"id"?: string,"is_cover"?: boolean,"kind"?: Database["public"]['Enums']["media_kind"],"listing_id"?: string,"mime_type"?: string | null,"public_key"?: string | null,"sort_order"?: number,"upload_key"?: string,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "listing_media_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    }
                  ]
                },"listing_private_details": {
                  Row: {
                    "exact_lat": number | null,"exact_lng": number | null,"listing_id": string,"owner_notes": string | null,"street_address": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "exact_lat"?: number | null,"exact_lng"?: number | null,"listing_id": string,"owner_notes"?: string | null,"street_address"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "exact_lat"?: number | null,"exact_lng"?: number | null,"listing_id"?: string,"owner_notes"?: string | null,"street_address"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "listing_private_details_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: true
      referencedRelation: "listings"
      referencedColumns: ["id"]
    }
                  ]
                },"listing_status_events": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"from_status": Database["public"]['Enums']["listing_status"] | null,"id": number,"listing_id": string,"reason": string | null,"reason_visible_to_owner": boolean,"to_status": Database["public"]['Enums']["listing_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"from_status"?: Database["public"]['Enums']["listing_status"] | null,"id"?: never,"listing_id": string,"reason"?: string | null,"reason_visible_to_owner"?: boolean,"to_status": Database["public"]['Enums']["listing_status"]
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"from_status"?: Database["public"]['Enums']["listing_status"] | null,"id"?: never,"listing_id"?: string,"reason"?: string | null,"reason_visible_to_owner"?: boolean,"to_status"?: Database["public"]['Enums']["listing_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "listing_status_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listing_status_events_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    }
                  ]
                },"listings": {
                  Row: {
                    "address_visibility": Database["public"]['Enums']["address_visibility"],"agent_id": string | null,"archived_at": string | null,"area_unit": Database["public"]['Enums']["area_unit"] | null,"area_value": number | null,"available_from": string | null,"balconies": number | null,"bathrooms": number | null,"bedrooms": number | null,"built_up_area": number | null,"carpet_area": number | null,"city_id": string | null,"contact_via_form": boolean,"country_id": string | null,"created_at": string,"currency": string | null,"description": string,"featured_until": string | null,"first_published_at": string | null,"floor_number": number | null,"furnishing": Database["public"]['Enums']["furnishing"] | null,"id": string,"is_featured": boolean,"locality_id": string | null,"owner_id": string,"parking_spaces": number | null,"plot_area": number | null,"possession_status": Database["public"]['Enums']["possession_status"] | null,"postal_code": string | null,"price_amount": number | null,"price_display": Database["public"]['Enums']["price_display"],"price_negotiable": boolean,"price_period": Database["public"]['Enums']["price_period"],"property_type_id": string | null,"public_lat": number | null,"public_lng": number | null,"published_at": string | null,"purpose": Database["public"]['Enums']["listing_purpose"],"reference_code": string,"region_id": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"search_vector": unknown,"seo_description": string | null,"seo_title": string | null,"show_email": boolean,"show_phone": boolean,"show_whatsapp": boolean,"slug": string,"status": Database["public"]['Enums']["listing_status"],"submitted_at": string | null,"title": string,"total_floors": number | null,"updated_at": string,"video_url": string | null,"virtual_tour_url": string | null,"year_built": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address_visibility"?: Database["public"]['Enums']["address_visibility"],"agent_id"?: string | null,"archived_at"?: string | null,"area_unit"?: Database["public"]['Enums']["area_unit"] | null,"area_value"?: number | null,"available_from"?: string | null,"balconies"?: number | null,"bathrooms"?: number | null,"bedrooms"?: number | null,"built_up_area"?: number | null,"carpet_area"?: number | null,"city_id"?: string | null,"contact_via_form"?: boolean,"country_id"?: string | null,"created_at"?: string,"currency"?: string | null,"description"?: string,"featured_until"?: string | null,"first_published_at"?: string | null,"floor_number"?: number | null,"furnishing"?: Database["public"]['Enums']["furnishing"] | null,"id"?: string,"is_featured"?: boolean,"locality_id"?: string | null,"owner_id": string,"parking_spaces"?: number | null,"plot_area"?: number | null,"possession_status"?: Database["public"]['Enums']["possession_status"] | null,"postal_code"?: string | null,"price_amount"?: number | null,"price_display"?: Database["public"]['Enums']["price_display"],"price_negotiable"?: boolean,"price_period"?: Database["public"]['Enums']["price_period"],"property_type_id"?: string | null,"public_lat"?: number | null,"public_lng"?: number | null,"published_at"?: string | null,"purpose": Database["public"]['Enums']["listing_purpose"],"reference_code"?: string,"region_id"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"search_vector"?: never,"seo_description"?: string | null,"seo_title"?: string | null,"show_email"?: boolean,"show_phone"?: boolean,"show_whatsapp"?: boolean,"slug": string,"status"?: Database["public"]['Enums']["listing_status"],"submitted_at"?: string | null,"title": string,"total_floors"?: number | null,"updated_at"?: string,"video_url"?: string | null,"virtual_tour_url"?: string | null,"year_built"?: number | null
                  }
                  Update: {
                    "address_visibility"?: Database["public"]['Enums']["address_visibility"],"agent_id"?: string | null,"archived_at"?: string | null,"area_unit"?: Database["public"]['Enums']["area_unit"] | null,"area_value"?: number | null,"available_from"?: string | null,"balconies"?: number | null,"bathrooms"?: number | null,"bedrooms"?: number | null,"built_up_area"?: number | null,"carpet_area"?: number | null,"city_id"?: string | null,"contact_via_form"?: boolean,"country_id"?: string | null,"created_at"?: string,"currency"?: string | null,"description"?: string,"featured_until"?: string | null,"first_published_at"?: string | null,"floor_number"?: number | null,"furnishing"?: Database["public"]['Enums']["furnishing"] | null,"id"?: string,"is_featured"?: boolean,"locality_id"?: string | null,"owner_id"?: string,"parking_spaces"?: number | null,"plot_area"?: number | null,"possession_status"?: Database["public"]['Enums']["possession_status"] | null,"postal_code"?: string | null,"price_amount"?: number | null,"price_display"?: Database["public"]['Enums']["price_display"],"price_negotiable"?: boolean,"price_period"?: Database["public"]['Enums']["price_period"],"property_type_id"?: string | null,"public_lat"?: number | null,"public_lng"?: number | null,"published_at"?: string | null,"purpose"?: Database["public"]['Enums']["listing_purpose"],"reference_code"?: string,"region_id"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"search_vector"?: never,"seo_description"?: string | null,"seo_title"?: string | null,"show_email"?: boolean,"show_phone"?: boolean,"show_whatsapp"?: boolean,"slug"?: string,"status"?: Database["public"]['Enums']["listing_status"],"submitted_at"?: string | null,"title"?: string,"total_floors"?: number | null,"updated_at"?: string,"video_url"?: string | null,"virtual_tour_url"?: string | null,"year_built"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "listings_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_city_id_fkey"
      columns: ["city_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_country_id_fkey"
      columns: ["country_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_currency_fkey"
      columns: ["currency"]
isOneToOne: false
      referencedRelation: "currencies"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "listings_locality_id_fkey"
      columns: ["locality_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_property_type_id_fkey"
      columns: ["property_type_id"]
isOneToOne: false
      referencedRelation: "property_types"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_region_id_fkey"
      columns: ["region_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"locations": {
                  Row: {
                    "country_code": string,"created_at": string,"id": string,"is_active": boolean,"lat": number | null,"level": Database["public"]['Enums']["location_level"],"lng": number | null,"name": string,"parent_id": string | null,"slug": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "country_code": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"lat"?: number | null,"level": Database["public"]['Enums']["location_level"],"lng"?: number | null,"name": string,"parent_id"?: string | null,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "country_code"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"lat"?: number | null,"level"?: Database["public"]['Enums']["location_level"],"lng"?: number | null,"name"?: string,"parent_id"?: string | null,"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "locations_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_outbox": {
                  Row: {
                    "attempts": number,"created_at": string,"id": number,"last_error": string | null,"next_attempt_at": string,"provider_message_id": string | null,"recipient_email": string | null,"recipient_user_id": string | null,"sent_at": string | null,"status": Database["public"]['Enums']["outbox_status"],"template": string,"template_data": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"id"?: never,"last_error"?: string | null,"next_attempt_at"?: string,"provider_message_id"?: string | null,"recipient_email"?: string | null,"recipient_user_id"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["outbox_status"],"template": string,"template_data"?: NonNullable<Json>
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"id"?: never,"last_error"?: string | null,"next_attempt_at"?: string,"provider_message_id"?: string | null,"recipient_email"?: string | null,"recipient_user_id"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["outbox_status"],"template"?: string,"template_data"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_outbox_recipient_user_id_fkey"
      columns: ["recipient_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_key": string | null,"created_at": string,"display_name": string,"id": string,"marketing_opt_in": boolean,"phone": string | null,"preferred_locale": string | null,"status": Database["public"]['Enums']["account_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_key"?: string | null,"created_at"?: string,"display_name": string,"id": string,"marketing_opt_in"?: boolean,"phone"?: string | null,"preferred_locale"?: string | null,"status"?: Database["public"]['Enums']["account_status"],"updated_at"?: string
                  }
                  Update: {
                    "avatar_key"?: string | null,"created_at"?: string,"display_name"?: string,"id"?: string,"marketing_opt_in"?: boolean,"phone"?: string | null,"preferred_locale"?: string | null,"status"?: Database["public"]['Enums']["account_status"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"property_types": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"is_residential": boolean,"name": string,"slug": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"is_residential"?: boolean,"name": string,"slug": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"is_residential"?: boolean,"name"?: string,"slug"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"site_settings": {
                  Row: {
                    "allowed_image_types": (string)[],"brand_name": string,"captcha_enabled": boolean,"comparison_max": number,"contact_email": string | null,"contact_phone": string | null,"contact_whatsapp": string | null,"default_area_unit": Database["public"]['Enums']["area_unit"],"default_currency": string | null,"default_locale": string,"default_timezone": string,"enquiry_limit_per_hour": number,"id": boolean,"material_change_policy": string,"material_fields": (string)[],"max_image_bytes": number,"max_images_per_listing": number,"new_listing_days": number,"owner_leads_enabled": boolean,"self_service_owner": boolean,"seo_default_description": string | null,"seo_default_title": string | null,"submission_limit_per_day": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "allowed_image_types"?: (string)[],"brand_name"?: string,"captcha_enabled"?: boolean,"comparison_max"?: number,"contact_email"?: string | null,"contact_phone"?: string | null,"contact_whatsapp"?: string | null,"default_area_unit"?: Database["public"]['Enums']["area_unit"],"default_currency"?: string | null,"default_locale"?: string,"default_timezone"?: string,"enquiry_limit_per_hour"?: number,"id"?: boolean,"material_change_policy"?: string,"material_fields"?: (string)[],"max_image_bytes"?: number,"max_images_per_listing"?: number,"new_listing_days"?: number,"owner_leads_enabled"?: boolean,"self_service_owner"?: boolean,"seo_default_description"?: string | null,"seo_default_title"?: string | null,"submission_limit_per_day"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "allowed_image_types"?: (string)[],"brand_name"?: string,"captcha_enabled"?: boolean,"comparison_max"?: number,"contact_email"?: string | null,"contact_phone"?: string | null,"contact_whatsapp"?: string | null,"default_area_unit"?: Database["public"]['Enums']["area_unit"],"default_currency"?: string | null,"default_locale"?: string,"default_timezone"?: string,"enquiry_limit_per_hour"?: number,"id"?: boolean,"material_change_policy"?: string,"material_fields"?: (string)[],"max_image_bytes"?: number,"max_images_per_listing"?: number,"new_listing_days"?: number,"owner_leads_enabled"?: boolean,"self_service_owner"?: boolean,"seo_default_description"?: string | null,"seo_default_title"?: string | null,"submission_limit_per_day"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "site_settings_default_currency_fkey"
      columns: ["default_currency"]
isOneToOne: false
      referencedRelation: "currencies"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "site_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_roles": {
                  Row: {
                    "granted_at": string,"granted_by": string | null,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "granted_at"?: string,"granted_by"?: string | null,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  Update: {
                    "granted_at"?: string,"granted_by"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_roles_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_roles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "admin_set_account_status":
{ Args: { "p_reason"?: string,"p_status": Database["public"]['Enums']["account_status"],"p_user_id": string }; Returns: undefined
                           },
"admin_set_role":
{ Args: { "p_granted": boolean,"p_role": Database["public"]['Enums']["app_role"],"p_user_id": string }; Returns: undefined
                           },
"assign_listing_agent":
{ Args: { "p_agent_id": string,"p_listing_id": string }; Returns: undefined
                           },
"become_owner":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"bootstrap_admin":
{ Args: { "p_email": string }; Returns: string
                           },
"cancel_visit_request":
{ Args: { "p_enquiry_id": string }; Returns: undefined
                           },
"get_listing_contact":
{ Args: { "p_listing_id": string }; Returns: {
              "agency_name": string,"contact_via_form": boolean,"display_name": string,"email": string,"phone": string,"whatsapp": string
            }[]
                           },
"get_listing_history":
{ Args: { "p_listing_id": string }; Returns: {
              "created_at": string,"from_status": Database["public"]['Enums']["listing_status"],"reason": string,"to_status": Database["public"]['Enums']["listing_status"]
            }[]
                           },
"moderate_listing":
{ Args: { "p_decision": string,"p_listing_id": string,"p_reason"?: string,"p_reason_visible_to_owner"?: boolean }; Returns: Database["public"]['Enums']["listing_status"]
                           },
"request_account_deletion":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"request_data_export":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"respond_to_visit":
{ Args: { "p_confirm": boolean,"p_enquiry_id": string }; Returns: Database["public"]['Enums']["visit_status"]
                           },
"restore_listing":
{ Args: { "p_listing_id": string }; Returns: Database["public"]['Enums']["listing_status"]
                           },
"set_listing_featured":
{ Args: { "p_featured": boolean,"p_listing_id": string,"p_until"?: string }; Returns: undefined
                           },
"set_listing_outcome":
{ Args: { "p_listing_id": string,"p_outcome": Database["public"]['Enums']["listing_status"] }; Returns: Database["public"]['Enums']["listing_status"]
                           },
"submit_enquiry":
{ Args: { "p_consent_text_version"?: string,"p_email": string,"p_kind"?: Database["public"]['Enums']["enquiry_kind"],"p_listing_id": string,"p_message": string,"p_name": string,"p_phone"?: string,"p_requested_timezone"?: string,"p_requested_visit_at"?: string }; Returns: string
                           },
"submit_listing":
{ Args: { "p_listing_id": string }; Returns: Database["public"]['Enums']["listing_status"]
                           },
"update_enquiry_status":
{ Args: { "p_enquiry_id": string,"p_status": Database["public"]['Enums']["enquiry_status"] }; Returns: undefined
                           },
"withdraw_listing":
{ Args: { "p_listing_id": string }; Returns: Database["public"]['Enums']["listing_status"]
                           }
          }
          Enums: {
            "account_status": "active"|"suspended"|"deletion_requested","address_visibility": "exact"|"approximate"|"hidden","app_role": "buyer"|"owner"|"agent"|"moderator"|"administrator","area_unit": "sq_m"|"sq_ft"|"acre"|"hectare","data_request_kind": "export"|"deletion","data_request_status": "pending"|"in_progress"|"completed"|"rejected","enquiry_kind": "enquiry"|"visit_request","enquiry_status": "new"|"in_progress"|"responded"|"closed"|"spam","furnishing": "unfurnished"|"semi_furnished"|"furnished","listing_purpose": "sale"|"rent","listing_status": "draft"|"pending_review"|"published"|"rejected"|"suspended"|"archived"|"sold"|"rented","location_level": "country"|"region"|"city"|"locality","media_kind": "image"|"document","outbox_status": "pending"|"sent"|"failed"|"skipped_not_configured","possession_status": "ready"|"under_construction"|"available_from_date","price_display": "show"|"on_request","price_period": "total"|"per_month"|"per_year"|"per_week"|"per_day","visit_status": "requested"|"confirmed"|"declined"|"cancelled"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "account_status": ["active", "suspended", "deletion_requested"],"address_visibility": ["exact", "approximate", "hidden"],"app_role": ["buyer", "owner", "agent", "moderator", "administrator"],"area_unit": ["sq_m", "sq_ft", "acre", "hectare"],"data_request_kind": ["export", "deletion"],"data_request_status": ["pending", "in_progress", "completed", "rejected"],"enquiry_kind": ["enquiry", "visit_request"],"enquiry_status": ["new", "in_progress", "responded", "closed", "spam"],"furnishing": ["unfurnished", "semi_furnished", "furnished"],"listing_purpose": ["sale", "rent"],"listing_status": ["draft", "pending_review", "published", "rejected", "suspended", "archived", "sold", "rented"],"location_level": ["country", "region", "city", "locality"],"media_kind": ["image", "document"],"outbox_status": ["pending", "sent", "failed", "skipped_not_configured"],"possession_status": ["ready", "under_construction", "available_from_date"],"price_display": ["show", "on_request"],"price_period": ["total", "per_month", "per_year", "per_week", "per_day"],"visit_status": ["requested", "confirmed", "declined", "cancelled"]
          }
        }
} as const
