
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
                },"banners": {
                  Row: {
                    "audience": string,"created_at": string,"cta_label": string | null,"ends_at": string | null,"id": string,"image_url": string | null,"is_active": boolean,"sort_order": number,"starts_at": string | null,"subtitle": string | null,"target_url": string | null,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "audience"?: string,"created_at"?: string,"cta_label"?: string | null,"ends_at"?: string | null,"id"?: string,"image_url"?: string | null,"is_active"?: boolean,"sort_order"?: number,"starts_at"?: string | null,"subtitle"?: string | null,"target_url"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "audience"?: string,"created_at"?: string,"cta_label"?: string | null,"ends_at"?: string | null,"id"?: string,"image_url"?: string | null,"is_active"?: boolean,"sort_order"?: number,"starts_at"?: string | null,"subtitle"?: string | null,"target_url"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"broadcasts": {
                  Row: {
                    "audience": string,"body": string,"channels": (Database["public"]['Enums']["notification_channel"])[],"city_id": string | null,"created_at": string,"created_by": string | null,"id": number,"recipients": number | null,"scheduled_at": string,"sent_at": string | null,"status": Database["public"]['Enums']["broadcast_status"],"title": string,"url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "audience": string,"body": string,"channels"?: (Database["public"]['Enums']["notification_channel"])[],"city_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: never,"recipients"?: number | null,"scheduled_at"?: string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["broadcast_status"],"title": string,"url"?: string | null
                  }
                  Update: {
                    "audience"?: string,"body"?: string,"channels"?: (Database["public"]['Enums']["notification_channel"])[],"city_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: never,"recipients"?: number | null,"scheduled_at"?: string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["broadcast_status"],"title"?: string,"url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "broadcasts_city_id_fkey"
      columns: ["city_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "broadcasts_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"builder_profiles": {
                  Row: {
                    "company_name": string,"created_at": string,"description": string | null,"is_public": boolean,"registration_number": string | null,"updated_at": string,"user_id": string,"website": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_name": string,"created_at"?: string,"description"?: string | null,"is_public"?: boolean,"registration_number"?: string | null,"updated_at"?: string,"user_id": string,"website"?: string | null
                  }
                  Update: {
                    "company_name"?: string,"created_at"?: string,"description"?: string | null,"is_public"?: boolean,"registration_number"?: string | null,"updated_at"?: string,"user_id"?: string,"website"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "builder_profiles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"builders": {
                  Row: {
                    "contact_email": string | null,"contact_phone": string | null,"created_at": string,"description": string | null,"id": string,"is_active": boolean,"logo_url": string | null,"name": string,"slug": string,"updated_at": string,"user_id": string | null,"website": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "contact_email"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"logo_url"?: string | null,"name": string,"slug": string,"updated_at"?: string,"user_id"?: string | null,"website"?: string | null
                  }
                  Update: {
                    "contact_email"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"logo_url"?: string | null,"name"?: string,"slug"?: string,"updated_at"?: string,"user_id"?: string | null,"website"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "builders_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
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
                    "assigned_to": string | null,"city": string | null,"consent_text_version": string | null,"created_at": string,"email": string | null,"first_response_at": string | null,"follow_up_at": string | null,"handled_at": string | null,"handled_by": string | null,"id": string,"interest": string | null,"ip_hash": string | null,"kind": Database["public"]['Enums']["enquiry_kind"],"lead_type": string,"listing_id": string | null,"lost_reason": string | null,"message": string,"name": string,"phone": string | null,"preferred_contact": string | null,"property_reference": string | null,"requested_timezone": string | null,"requested_visit_at": string | null,"sender_user_id": string | null,"source": string,"status": Database["public"]['Enums']["enquiry_status"],"team_assignee": string | null,"updated_at": string,"utm": NonNullable<Json>,"visit_status": Database["public"]['Enums']["visit_status"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_to"?: string | null,"city"?: string | null,"consent_text_version"?: string | null,"created_at"?: string,"email"?: string | null,"first_response_at"?: string | null,"follow_up_at"?: string | null,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"interest"?: string | null,"ip_hash"?: string | null,"kind"?: Database["public"]['Enums']["enquiry_kind"],"lead_type"?: string,"listing_id"?: string | null,"lost_reason"?: string | null,"message": string,"name": string,"phone"?: string | null,"preferred_contact"?: string | null,"property_reference"?: string | null,"requested_timezone"?: string | null,"requested_visit_at"?: string | null,"sender_user_id"?: string | null,"source"?: string,"status"?: Database["public"]['Enums']["enquiry_status"],"team_assignee"?: string | null,"updated_at"?: string,"utm"?: NonNullable<Json>,"visit_status"?: Database["public"]['Enums']["visit_status"] | null
                  }
                  Update: {
                    "assigned_to"?: string | null,"city"?: string | null,"consent_text_version"?: string | null,"created_at"?: string,"email"?: string | null,"first_response_at"?: string | null,"follow_up_at"?: string | null,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"interest"?: string | null,"ip_hash"?: string | null,"kind"?: Database["public"]['Enums']["enquiry_kind"],"lead_type"?: string,"listing_id"?: string | null,"lost_reason"?: string | null,"message"?: string,"name"?: string,"phone"?: string | null,"preferred_contact"?: string | null,"property_reference"?: string | null,"requested_timezone"?: string | null,"requested_visit_at"?: string | null,"sender_user_id"?: string | null,"source"?: string,"status"?: Database["public"]['Enums']["enquiry_status"],"team_assignee"?: string | null,"updated_at"?: string,"utm"?: NonNullable<Json>,"visit_status"?: Database["public"]['Enums']["visit_status"] | null
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
    },{
      foreignKeyName: "enquiries_team_assignee_fkey"
      columns: ["team_assignee"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"enquiry_events": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"enquiry_id": string,"from_value": string | null,"id": number,"kind": string,"note": string | null,"to_value": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"enquiry_id": string,"from_value"?: string | null,"id"?: never,"kind": string,"note"?: string | null,"to_value"?: string | null
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"enquiry_id"?: string,"from_value"?: string | null,"id"?: never,"kind"?: string,"note"?: string | null,"to_value"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "enquiry_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "enquiry_events_enquiry_id_fkey"
      columns: ["enquiry_id"]
isOneToOne: false
      referencedRelation: "enquiries"
      referencedColumns: ["id"]
    }
                  ]
                },"enquiry_notes": {
                  Row: {
                    "author_id": string | null,"body": string,"created_at": string,"enquiry_id": string,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body": string,"created_at"?: string,"enquiry_id": string,"id"?: never
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"enquiry_id"?: string,"id"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "enquiry_notes_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "enquiry_notes_enquiry_id_fkey"
      columns: ["enquiry_id"]
isOneToOne: false
      referencedRelation: "enquiries"
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
                },"feature_flags": {
                  Row: {
                    "description": string,"enabled": boolean,"key": string,"label": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string,"enabled"?: boolean,"key": string,"label": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "description"?: string,"enabled"?: boolean,"key"?: string,"label"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "feature_flags_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"floating_action": {
                  Row: {
                    "icon": string,"id": boolean,"is_active": boolean,"label": string,"position": string,"target_url": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "icon"?: string,"id"?: boolean,"is_active"?: boolean,"label"?: string,"position"?: string,"target_url"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "icon"?: string,"id"?: boolean,"is_active"?: boolean,"label"?: string,"position"?: string,"target_url"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "floating_action_updated_by_fkey"
      columns: ["updated_by"]
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
                },"import_batches": {
                  Row: {
                    "created_at": string,"created_by": string | null,"file_name": string | null,"id": string,"imported_rows": number,"owner_id": string,"publish_requested": boolean,"total_rows": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"file_name"?: string | null,"id"?: string,"imported_rows"?: number,"owner_id": string,"publish_requested": boolean,"total_rows"?: number
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"file_name"?: string | null,"id"?: string,"imported_rows"?: number,"owner_id"?: string,"publish_requested"?: boolean,"total_rows"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_batches_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_batches_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"integration_settings": {
                  Row: {
                    "email_from": string | null,"email_reply_to": string | null,"id": boolean,"push_enabled": boolean,"sheets_enabled": boolean,"sheets_webhook_url": string | null,"updated_at": string,"updated_by": string | null,"whatsapp_enabled": boolean,"whatsapp_phone_number_id": string | null,"whatsapp_templates": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "email_from"?: string | null,"email_reply_to"?: string | null,"id"?: boolean,"push_enabled"?: boolean,"sheets_enabled"?: boolean,"sheets_webhook_url"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"whatsapp_enabled"?: boolean,"whatsapp_phone_number_id"?: string | null,"whatsapp_templates"?: NonNullable<Json>
                  }
                  Update: {
                    "email_from"?: string | null,"email_reply_to"?: string | null,"id"?: boolean,"push_enabled"?: boolean,"sheets_enabled"?: boolean,"sheets_webhook_url"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"whatsapp_enabled"?: boolean,"whatsapp_phone_number_id"?: string | null,"whatsapp_templates"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "integration_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"job_queue": {
                  Row: {
                    "attempts": number,"created_at": string,"finished_at": string | null,"id": number,"kind": string,"last_error": string | null,"listing_id": string,"next_attempt_at": string,"payload": NonNullable<Json>,"status": Database["public"]['Enums']["outbox_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"finished_at"?: string | null,"id"?: never,"kind": string,"last_error"?: string | null,"listing_id": string,"next_attempt_at"?: string,"payload"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["outbox_status"]
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"finished_at"?: string | null,"id"?: never,"kind"?: string,"last_error"?: string | null,"listing_id"?: string,"next_attempt_at"?: string,"payload"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["outbox_status"]
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
                },"link_clicks": {
                  Row: {
                    "clicks": number,"day": string,"link_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clicks"?: number,"day": string,"link_key": string
                  }
                  Update: {
                    "clicks"?: number,"day"?: string,"link_key"?: string
                  }
                  Relationships: [
                    
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
                    "alt_text": string | null,"bytes": number | null,"content_hash": string | null,"created_at": string,"height": number | null,"id": string,"is_cover": boolean,"kind": Database["public"]['Enums']["media_kind"],"listing_id": string,"mime_type": string | null,"public_key": string | null,"sort_order": number,"upload_key": string,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "alt_text"?: string | null,"bytes"?: number | null,"content_hash"?: string | null,"created_at"?: string,"height"?: number | null,"id"?: string,"is_cover"?: boolean,"kind"?: Database["public"]['Enums']["media_kind"],"listing_id": string,"mime_type"?: string | null,"public_key"?: string | null,"sort_order"?: number,"upload_key": string,"width"?: number | null
                  }
                  Update: {
                    "alt_text"?: string | null,"bytes"?: number | null,"content_hash"?: string | null,"created_at"?: string,"height"?: number | null,"id"?: string,"is_cover"?: boolean,"kind"?: Database["public"]['Enums']["media_kind"],"listing_id"?: string,"mime_type"?: string | null,"public_key"?: string | null,"sort_order"?: number,"upload_key"?: string,"width"?: number | null
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
                },"listing_reports": {
                  Row: {
                    "created_at": string,"details": string | null,"handled_at": string | null,"handled_by": string | null,"id": number,"ip_hash": string | null,"listing_id": string,"reason": string,"reporter_user_id": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"details"?: string | null,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: never,"ip_hash"?: string | null,"listing_id": string,"reason": string,"reporter_user_id"?: string | null,"status"?: string
                  }
                  Update: {
                    "created_at"?: string,"details"?: string | null,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: never,"ip_hash"?: string | null,"listing_id"?: string,"reason"?: string,"reporter_user_id"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "listing_reports_handled_by_fkey"
      columns: ["handled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listing_reports_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listing_reports_reporter_user_id_fkey"
      columns: ["reporter_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
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
                },"listing_videos": {
                  Row: {
                    "created_at": string,"id": string,"instagram_kind": string | null,"listing_id": string,"provider": Database["public"]['Enums']["video_provider"],"sort_order": number,"video_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"instagram_kind"?: string | null,"listing_id": string,"provider": Database["public"]['Enums']["video_provider"],"sort_order"?: number,"video_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"instagram_kind"?: string | null,"listing_id"?: string,"provider"?: Database["public"]['Enums']["video_provider"],"sort_order"?: number,"video_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "listing_videos_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    }
                  ]
                },"listing_views": {
                  Row: {
                    "day": string,"listing_id": string,"views": number
                  }
                  ComputedFields: never
                  Insert: {
                    "day": string,"listing_id": string,"views"?: number
                  }
                  Update: {
                    "day"?: string,"listing_id"?: string,"views"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "listing_views_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    }
                  ]
                },"listings": {
                  Row: {
                    "address_visibility": Database["public"]['Enums']["address_visibility"],"agent_id": string | null,"archived_at": string | null,"area_unit": Database["public"]['Enums']["area_unit"] | null,"area_value": number | null,"availability": string,"available_from": string | null,"balconies": number | null,"bathrooms": number | null,"bedrooms": number | null,"builder_id": string | null,"built_up_area": number | null,"carpet_area": number | null,"category": Database["public"]['Enums']["listing_category"],"city_id": string | null,"configurations": (string)[],"contact_via_form": boolean,"country_id": string | null,"created_at": string,"currency": string | null,"description": string,"expired_at": string | null,"expiry_reminded_at": string | null,"featured_until": string | null,"first_published_at": string | null,"floor_number": number | null,"furnishing": Database["public"]['Enums']["furnishing"] | null,"geocoded_at": string | null,"id": string,"import_batch_id": string | null,"is_featured": boolean,"landmark": string | null,"launch_date": string | null,"locality_id": string | null,"owner_id": string,"parking_spaces": number | null,"plot_area": number | null,"possession_status": Database["public"]['Enums']["possession_status"] | null,"postal_code": string | null,"price_amount": number | null,"price_display": Database["public"]['Enums']["price_display"],"price_max": number | null,"price_negotiable": boolean,"price_period": Database["public"]['Enums']["price_period"],"project_name": string | null,"project_registration_number": string | null,"property_type_id": string | null,"public_lat": number | null,"public_lng": number | null,"published_at": string | null,"purpose": Database["public"]['Enums']["listing_purpose"],"reference_code": string,"region_id": string | null,"registration_verified": boolean,"renewed_at": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"search_vector": unknown,"seo_description": string | null,"seo_title": string | null,"show_email": boolean,"show_phone": boolean,"show_whatsapp": boolean,"slug": string,"status": Database["public"]['Enums']["listing_status"],"submitted_at": string | null,"title": string,"total_floors": number | null,"updated_at": string,"video_url": string | null,"virtual_tour_url": string | null,"year_built": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address_visibility"?: Database["public"]['Enums']["address_visibility"],"agent_id"?: string | null,"archived_at"?: string | null,"area_unit"?: Database["public"]['Enums']["area_unit"] | null,"area_value"?: number | null,"availability"?: string,"available_from"?: string | null,"balconies"?: number | null,"bathrooms"?: number | null,"bedrooms"?: number | null,"builder_id"?: string | null,"built_up_area"?: number | null,"carpet_area"?: number | null,"category": Database["public"]['Enums']["listing_category"],"city_id"?: string | null,"configurations"?: (string)[],"contact_via_form"?: boolean,"country_id"?: string | null,"created_at"?: string,"currency"?: string | null,"description"?: string,"expired_at"?: string | null,"expiry_reminded_at"?: string | null,"featured_until"?: string | null,"first_published_at"?: string | null,"floor_number"?: number | null,"furnishing"?: Database["public"]['Enums']["furnishing"] | null,"geocoded_at"?: string | null,"id"?: string,"import_batch_id"?: string | null,"is_featured"?: boolean,"landmark"?: string | null,"launch_date"?: string | null,"locality_id"?: string | null,"owner_id": string,"parking_spaces"?: number | null,"plot_area"?: number | null,"possession_status"?: Database["public"]['Enums']["possession_status"] | null,"postal_code"?: string | null,"price_amount"?: number | null,"price_display"?: Database["public"]['Enums']["price_display"],"price_max"?: number | null,"price_negotiable"?: boolean,"price_period"?: Database["public"]['Enums']["price_period"],"project_name"?: string | null,"project_registration_number"?: string | null,"property_type_id"?: string | null,"public_lat"?: number | null,"public_lng"?: number | null,"published_at"?: string | null,"purpose": Database["public"]['Enums']["listing_purpose"],"reference_code"?: string,"region_id"?: string | null,"registration_verified"?: boolean,"renewed_at"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"search_vector"?: never,"seo_description"?: string | null,"seo_title"?: string | null,"show_email"?: boolean,"show_phone"?: boolean,"show_whatsapp"?: boolean,"slug": string,"status"?: Database["public"]['Enums']["listing_status"],"submitted_at"?: string | null,"title": string,"total_floors"?: number | null,"updated_at"?: string,"video_url"?: string | null,"virtual_tour_url"?: string | null,"year_built"?: number | null
                  }
                  Update: {
                    "address_visibility"?: Database["public"]['Enums']["address_visibility"],"agent_id"?: string | null,"archived_at"?: string | null,"area_unit"?: Database["public"]['Enums']["area_unit"] | null,"area_value"?: number | null,"availability"?: string,"available_from"?: string | null,"balconies"?: number | null,"bathrooms"?: number | null,"bedrooms"?: number | null,"builder_id"?: string | null,"built_up_area"?: number | null,"carpet_area"?: number | null,"category"?: Database["public"]['Enums']["listing_category"],"city_id"?: string | null,"configurations"?: (string)[],"contact_via_form"?: boolean,"country_id"?: string | null,"created_at"?: string,"currency"?: string | null,"description"?: string,"expired_at"?: string | null,"expiry_reminded_at"?: string | null,"featured_until"?: string | null,"first_published_at"?: string | null,"floor_number"?: number | null,"furnishing"?: Database["public"]['Enums']["furnishing"] | null,"geocoded_at"?: string | null,"id"?: string,"import_batch_id"?: string | null,"is_featured"?: boolean,"landmark"?: string | null,"launch_date"?: string | null,"locality_id"?: string | null,"owner_id"?: string,"parking_spaces"?: number | null,"plot_area"?: number | null,"possession_status"?: Database["public"]['Enums']["possession_status"] | null,"postal_code"?: string | null,"price_amount"?: number | null,"price_display"?: Database["public"]['Enums']["price_display"],"price_max"?: number | null,"price_negotiable"?: boolean,"price_period"?: Database["public"]['Enums']["price_period"],"project_name"?: string | null,"project_registration_number"?: string | null,"property_type_id"?: string | null,"public_lat"?: number | null,"public_lng"?: number | null,"published_at"?: string | null,"purpose"?: Database["public"]['Enums']["listing_purpose"],"reference_code"?: string,"region_id"?: string | null,"registration_verified"?: boolean,"renewed_at"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"search_vector"?: never,"seo_description"?: string | null,"seo_title"?: string | null,"show_email"?: boolean,"show_phone"?: boolean,"show_whatsapp"?: boolean,"slug"?: string,"status"?: Database["public"]['Enums']["listing_status"],"submitted_at"?: string | null,"title"?: string,"total_floors"?: number | null,"updated_at"?: string,"video_url"?: string | null,"virtual_tour_url"?: string | null,"year_built"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "listings_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_builder_fk"
      columns: ["builder_id"]
isOneToOne: false
      referencedRelation: "builders"
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
      foreignKeyName: "listings_import_batch_id_fkey"
      columns: ["import_batch_id"]
isOneToOne: false
      referencedRelation: "import_batches"
      referencedColumns: ["id"]
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
                    "attempts": number,"broadcast_id": number | null,"channel": Database["public"]['Enums']["notification_channel"],"created_at": string,"id": number,"last_error": string | null,"next_attempt_at": string,"notification_id": number | null,"provider_message_id": string | null,"recipient_email": string | null,"recipient_user_id": string | null,"sent_at": string | null,"status": Database["public"]['Enums']["outbox_status"],"template": string,"template_data": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"broadcast_id"?: number | null,"channel"?: Database["public"]['Enums']["notification_channel"],"created_at"?: string,"id"?: never,"last_error"?: string | null,"next_attempt_at"?: string,"notification_id"?: number | null,"provider_message_id"?: string | null,"recipient_email"?: string | null,"recipient_user_id"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["outbox_status"],"template": string,"template_data"?: NonNullable<Json>
                  }
                  Update: {
                    "attempts"?: number,"broadcast_id"?: number | null,"channel"?: Database["public"]['Enums']["notification_channel"],"created_at"?: string,"id"?: never,"last_error"?: string | null,"next_attempt_at"?: string,"notification_id"?: number | null,"provider_message_id"?: string | null,"recipient_email"?: string | null,"recipient_user_id"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["outbox_status"],"template"?: string,"template_data"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_outbox_broadcast_fk"
      columns: ["broadcast_id"]
isOneToOne: false
      referencedRelation: "broadcasts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_outbox_notification_id_fkey"
      columns: ["notification_id"]
isOneToOne: false
      referencedRelation: "notifications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_outbox_recipient_user_id_fkey"
      columns: ["recipient_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_preferences": {
                  Row: {
                    "alerts_enabled": boolean,"email_enabled": boolean,"enquiry_alerts": (string)[],"push_enabled": boolean,"quiet_hours_enabled": boolean,"review_alerts": (string)[],"timezone": string | null,"updated_at": string,"user_id": string,"whatsapp_enabled": boolean,"whatsapp_number": string | null,"whatsapp_opt_in_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "alerts_enabled"?: boolean,"email_enabled"?: boolean,"enquiry_alerts"?: (string)[],"push_enabled"?: boolean,"quiet_hours_enabled"?: boolean,"review_alerts"?: (string)[],"timezone"?: string | null,"updated_at"?: string,"user_id": string,"whatsapp_enabled"?: boolean,"whatsapp_number"?: string | null,"whatsapp_opt_in_at"?: string | null
                  }
                  Update: {
                    "alerts_enabled"?: boolean,"email_enabled"?: boolean,"enquiry_alerts"?: (string)[],"push_enabled"?: boolean,"quiet_hours_enabled"?: boolean,"review_alerts"?: (string)[],"timezone"?: string | null,"updated_at"?: string,"user_id"?: string,"whatsapp_enabled"?: boolean,"whatsapp_number"?: string | null,"whatsapp_opt_in_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_preferences_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "broadcast_id": number | null,"created_at": string,"data": NonNullable<Json>,"id": number,"kind": string,"read_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "broadcast_id"?: number | null,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: never,"kind": string,"read_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "broadcast_id"?: number | null,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: never,"kind"?: string,"read_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_broadcast_fk"
      columns: ["broadcast_id"]
isOneToOne: false
      referencedRelation: "broadcasts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
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
                },"push_tokens": {
                  Row: {
                    "created_at": string,"last_seen_at": string,"platform": string,"token": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"last_seen_at"?: string,"platform": string,"token": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"last_seen_at"?: string,"platform"?: string,"token"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_tokens_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"saved_searches": {
                  Row: {
                    "alerts": boolean,"created_at": string,"filters": NonNullable<Json>,"id": string,"last_checked_at": string,"name": string,"query_string": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alerts"?: boolean,"created_at"?: string,"filters"?: NonNullable<Json>,"id"?: string,"last_checked_at"?: string,"name": string,"query_string"?: string,"user_id"?: string
                  }
                  Update: {
                    "alerts"?: boolean,"created_at"?: string,"filters"?: NonNullable<Json>,"id"?: string,"last_checked_at"?: string,"name"?: string,"query_string"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_searches_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"site_settings": {
                  Row: {
                    "allowed_image_types": (string)[],"brand_name": string,"broadcast_weekly_cap": number,"captcha_enabled": boolean,"comparison_max": number,"contact_email": string | null,"contact_phone": string | null,"contact_whatsapp": string | null,"default_area_unit": Database["public"]['Enums']["area_unit"],"default_currency": string | null,"default_locale": string,"default_timezone": string,"enquiry_limit_per_hour": number,"id": boolean,"listing_expiry_days": number,"material_change_policy": string,"material_fields": (string)[],"max_image_bytes": number,"max_images_per_listing": number,"new_listing_days": number,"owner_leads_enabled": boolean,"quiet_end_hour": number,"quiet_start_hour": number,"radius_options": (number)[],"review_hours_target": number,"self_service_owner": boolean,"seo_default_description": string | null,"seo_default_title": string | null,"submission_limit_per_day": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "allowed_image_types"?: (string)[],"brand_name"?: string,"broadcast_weekly_cap"?: number,"captcha_enabled"?: boolean,"comparison_max"?: number,"contact_email"?: string | null,"contact_phone"?: string | null,"contact_whatsapp"?: string | null,"default_area_unit"?: Database["public"]['Enums']["area_unit"],"default_currency"?: string | null,"default_locale"?: string,"default_timezone"?: string,"enquiry_limit_per_hour"?: number,"id"?: boolean,"listing_expiry_days"?: number,"material_change_policy"?: string,"material_fields"?: (string)[],"max_image_bytes"?: number,"max_images_per_listing"?: number,"new_listing_days"?: number,"owner_leads_enabled"?: boolean,"quiet_end_hour"?: number,"quiet_start_hour"?: number,"radius_options"?: (number)[],"review_hours_target"?: number,"self_service_owner"?: boolean,"seo_default_description"?: string | null,"seo_default_title"?: string | null,"submission_limit_per_day"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "allowed_image_types"?: (string)[],"brand_name"?: string,"broadcast_weekly_cap"?: number,"captcha_enabled"?: boolean,"comparison_max"?: number,"contact_email"?: string | null,"contact_phone"?: string | null,"contact_whatsapp"?: string | null,"default_area_unit"?: Database["public"]['Enums']["area_unit"],"default_currency"?: string | null,"default_locale"?: string,"default_timezone"?: string,"enquiry_limit_per_hour"?: number,"id"?: boolean,"listing_expiry_days"?: number,"material_change_policy"?: string,"material_fields"?: (string)[],"max_image_bytes"?: number,"max_images_per_listing"?: number,"new_listing_days"?: number,"owner_leads_enabled"?: boolean,"quiet_end_hour"?: number,"quiet_start_hour"?: number,"radius_options"?: (number)[],"review_hours_target"?: number,"self_service_owner"?: boolean,"seo_default_description"?: string | null,"seo_default_title"?: string | null,"submission_limit_per_day"?: number,"updated_at"?: string,"updated_by"?: string | null
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
                },"web_push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"last_seen_at": string,"p256dh": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"last_seen_at"?: string,"p256dh": string,"user_id": string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"last_seen_at"?: string,"p256dh"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "web_push_subscriptions_user_id_fkey"
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
            "add_enquiry_note":
{ Args: { "p_body": string,"p_enquiry_id": string }; Returns: number
                           },
"admin_add_team_member":
{ Args: { "p_email": string,"p_role": Database["public"]['Enums']["app_role"] }; Returns: string
                           },
"admin_broadcast_audience_size":
{ Args: { "p_audience": string,"p_city"?: string }; Returns: {
              "accepts_news": number,"total": number
            }[]
                           },
"admin_broadcast_report":
{ Args: { "p_id": number }; Returns: {
              "channel": string,"status": string,"total": number
            }[]
                           },
"admin_cancel_broadcast":
{ Args: { "p_id": number }; Returns: undefined
                           },
"admin_create_broadcast":
{ Args: { "p_audience": string,"p_body": string,"p_channels": (Database["public"]['Enums']["notification_channel"])[],"p_city": string,"p_scheduled_at"?: string,"p_title": string,"p_url": string }; Returns: number
                           },
"admin_create_lead":
{ Args: { "p_city"?: string,"p_email": string,"p_interest": string,"p_listing_id"?: string,"p_message": string,"p_name": string,"p_phone": string,"p_source"?: string }; Returns: string
                           },
"admin_enquiry_duplicates":
{ Args: { "p_enquiry_id": string }; Returns: {
              "created_at": string,"id": string,"listing_title": string,"source": string,"status": Database["public"]['Enums']["enquiry_status"]
            }[]
                           },
"admin_handle_report":
{ Args: { "p_report_id": number,"p_status": string }; Returns: undefined
                           },
"admin_import_listings":
{ Args: { "p_file_name": string,"p_owner_id": string,"p_publish": boolean,"p_rows": Json }; Returns: Json
                           },
"admin_integration_secrets":
{ Args: Record<PropertyKey, never>; Returns: {
              "is_set": boolean,"name": string,"updated_at": string
            }[]
                           },
"admin_list_users":
{ Args: { "p_kind"?: string,"p_limit"?: number,"p_offset"?: number,"p_query"?: string }; Returns: {
              "created_at": string,"display_name": string,"email": string,"email_confirmed": boolean,"enquiries_count": number,"id": string,"last_sign_in_at": string,"listings_count": number,"roles": (Database["public"]['Enums']["app_role"])[],"status": Database["public"]['Enums']["account_status"]
            }[]
                           },
"admin_listing_flags":
{ Args: { "p_listing_id": string }; Returns: {
              "detail": string,"flag": string
            }[]
                           },
"admin_merge_builders":
{ Args: { "p_from": string,"p_into": string }; Returns: number
                           },
"admin_new_sheets_secret":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"admin_record_export":
{ Args: { "p_kind": string,"p_rows": number }; Returns: undefined
                           },
"admin_remove_from_team":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"admin_send_test_notification":
{ Args: { "p_channel": Database["public"]['Enums']["notification_channel"] }; Returns: undefined
                           },
"admin_set_account_status":
{ Args: { "p_reason"?: string,"p_status": Database["public"]['Enums']["account_status"],"p_user_id": string }; Returns: undefined
                           },
"admin_set_integration_secret":
{ Args: { "p_name": string,"p_value": string }; Returns: undefined
                           },
"admin_set_listing_project":
{ Args: { "p_builder_id": string,"p_listing_id": string,"p_registration_verified": boolean }; Returns: undefined
                           },
"admin_set_role":
{ Args: { "p_granted": boolean,"p_role": Database["public"]['Enums']["app_role"],"p_user_id": string }; Returns: undefined
                           },
"admin_sync_all_enquiries_to_sheet":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"admin_update_data_request":
{ Args: { "p_id": string,"p_notes"?: string,"p_status": Database["public"]['Enums']["data_request_status"] }; Returns: undefined
                           },
"admin_update_enquiry":
{ Args: { "p_enquiry_id": string,"p_follow_up_at": string,"p_lost_reason"?: string,"p_status": Database["public"]['Enums']["enquiry_status"],"p_team_assignee": string }; Returns: undefined
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
"enquiry_team":
{ Args: Record<PropertyKey, never>; Returns: {
              "display_name": string,"id": string
            }[]
                           },
"follow_site_link":
{ Args: { "p_key": string,"p_visitor"?: string }; Returns: string
                           },
"geocode_cache_get":
{ Args: { "p_query": string }; Returns: {
              "found": boolean,"label": string,"lat": number,"lng": number
            }[]
                           },
"geocode_cache_put":
{ Args: { "p_label": string,"p_lat": number,"p_lng": number,"p_query": string }; Returns: undefined
                           },
"geocode_rate_limit":
{ Args: { "p_key": string }; Returns: undefined
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
"log_contact_attempt":
{ Args: { "p_enquiry_id": string,"p_note"?: string,"p_outcome": string }; Returns: undefined
                           },
"mark_notifications_read":
{ Args: { "p_ids"?: (number)[] }; Returns: number
                           },
"moderate_listing":
{ Args: { "p_decision": string,"p_listing_id": string,"p_reason"?: string,"p_reason_visible_to_owner"?: boolean }; Returns: Database["public"]['Enums']["listing_status"]
                           },
"must_change_password":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"my_listing_stats":
{ Args: Record<PropertyKey, never>; Returns: {
              "enquiries_30d": number,"enquiries_total": number,"expires_at": string,"listing_id": string,"saves": number,"views_30d": number
            }[]
                           },
"record_listing_view":
{ Args: { "p_listing_id": string,"p_visitor"?: string }; Returns: undefined
                           },
"register_push_token":
{ Args: { "p_platform": string,"p_token": string }; Returns: undefined
                           },
"register_web_push":
{ Args: { "p_auth": string,"p_endpoint": string,"p_p256dh": string }; Returns: undefined
                           },
"renew_listing":
{ Args: { "p_listing_id": string }; Returns: Database["public"]['Enums']["listing_status"]
                           },
"report_listing":
{ Args: { "p_details"?: string,"p_listing_id": string,"p_reason": string }; Returns: undefined
                           },
"request_account_deletion":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"request_data_export":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"require_password_change":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"respond_to_visit":
{ Args: { "p_confirm": boolean,"p_enquiry_id": string }; Returns: Database["public"]['Enums']["visit_status"]
                           },
"restore_listing":
{ Args: { "p_listing_id": string }; Returns: Database["public"]['Enums']["listing_status"]
                           },
"search_listings":
{ Args: { "p_amenity_ids"?: (string)[],"p_area_unit"?: Database["public"]['Enums']["area_unit"],"p_builder_id"?: string,"p_category"?: Database["public"]['Enums']["listing_category"],"p_construction"?: Database["public"]['Enums']["possession_status"],"p_currency"?: string,"p_cursor"?: string,"p_featured_only"?: boolean,"p_furnishing"?: Database["public"]['Enums']["furnishing"],"p_limit"?: number,"p_listed_within_days"?: number,"p_location_id"?: string,"p_max_area"?: number,"p_max_price"?: number,"p_min_area"?: number,"p_min_bathrooms"?: number,"p_min_bedrooms"?: number,"p_min_price"?: number,"p_near_lat"?: number,"p_near_lng"?: number,"p_postal_code"?: string,"p_property_type_ids"?: (string)[],"p_purpose"?: Database["public"]['Enums']["listing_purpose"],"p_q"?: string,"p_radius_km"?: number,"p_sort"?: string }; Returns: {
              "area_unit": Database["public"]['Enums']["area_unit"],"area_value": number,"availability": string,"bathrooms": number,"bedrooms": number,"builder_name": string,"builder_slug": string,"category": Database["public"]['Enums']["listing_category"],"city_name": string,"construction": Database["public"]['Enums']["possession_status"],"cover_alt": string,"cover_key": string,"currency": string,"cursor": string,"distance_km": number,"first_published_at": string,"id": string,"is_featured": boolean,"locality_name": string,"price_amount": number,"price_display": Database["public"]['Enums']["price_display"],"price_max": number,"price_negotiable": boolean,"price_period": Database["public"]['Enums']["price_period"],"project_name": string,"property_type_name": string,"purpose": Database["public"]['Enums']["listing_purpose"],"reference_code": string,"slug": string,"title": string
            }[]
                           },
"set_listing_availability":
{ Args: { "p_availability": string,"p_listing_id": string }; Returns: undefined
                           },
"set_listing_featured":
{ Args: { "p_featured": boolean,"p_listing_id": string,"p_until"?: string }; Returns: undefined
                           },
"set_listing_outcome":
{ Args: { "p_listing_id": string,"p_outcome": Database["public"]['Enums']["listing_status"] }; Returns: Database["public"]['Enums']["listing_status"]
                           },
"submit_contact_lead":
{ Args: { "p_city"?: string,"p_consent_text_version"?: string,"p_email": string,"p_interest": string,"p_message": string,"p_name": string,"p_phone": string,"p_preferred_contact"?: string,"p_property_reference"?: string,"p_source"?: string,"p_utm"?: Json }; Returns: string
                           },
"submit_enquiry":
{ Args: { "p_consent_text_version"?: string,"p_email": string,"p_kind"?: Database["public"]['Enums']["enquiry_kind"],"p_listing_id": string,"p_message": string,"p_name": string,"p_phone"?: string,"p_requested_timezone"?: string,"p_requested_visit_at"?: string,"p_source"?: string,"p_utm"?: Json }; Returns: string
                           },
"submit_listing":
{ Args: { "p_listing_id": string }; Returns: Database["public"]['Enums']["listing_status"]
                           },
"unregister_push_token":
{ Args: { "p_token": string }; Returns: undefined
                           },
"unregister_web_push":
{ Args: { "p_endpoint": string }; Returns: undefined
                           },
"update_enquiry_status":
{ Args: { "p_enquiry_id": string,"p_status": Database["public"]['Enums']["enquiry_status"] }; Returns: undefined
                           },
"withdraw_listing":
{ Args: { "p_listing_id": string }; Returns: Database["public"]['Enums']["listing_status"]
                           },
"worker_claim_jobs":
{ Args: { "p_limit"?: number }; Returns: {
              "attempts": number,
"created_at": string,
"finished_at": string | null,
"id": number,
"kind": string,
"last_error": string | null,
"listing_id": string,
"next_attempt_at": string,
"payload": NonNullable<Json>,
"status": Database["public"]['Enums']["outbox_status"]
            }[]
                          SetofOptions: {
        from: "*"
        to: "job_queue"
        isOneToOne: false
        isSetofReturn: true
      } },
"worker_claim_notifications":
{ Args: { "p_channels"?: (Database["public"]['Enums']["notification_channel"])[],"p_limit"?: number }; Returns: {
              "attempts": number,"channel": Database["public"]['Enums']["notification_channel"],"id": number,"notification_id": number,"push_tokens": (string)[],"recipient_email": string,"recipient_locale": string,"recipient_name": string,"recipient_phone": string,"template": string,"template_data": Json,"web_push": Json
            }[]
                           },
"worker_expire_listings":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"worker_finalize_import":
{ Args: { "p_listing_id": string,"p_publish": boolean }; Returns: Database["public"]['Enums']["listing_status"]
                           },
"worker_finish_job":
{ Args: { "p_error"?: string,"p_id": number,"p_ok": boolean }; Returns: undefined
                           },
"worker_finish_notification":
{ Args: { "p_error"?: string,"p_id": number,"p_permanent"?: boolean,"p_provider_message_id"?: string,"p_status": Database["public"]['Enums']["outbox_status"] }; Returns: undefined
                           },
"worker_integration_config":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"worker_listing_place":
{ Args: { "p_listing_id": string }; Returns: {
              "address_visibility": Database["public"]['Enums']["address_visibility"],"city": string,"country_code": string,"landmark": string,"locality": string,"postal_code": string,"region": string
            }[]
                           },
"worker_remove_push_token":
{ Args: { "p_token": string }; Returns: undefined
                           },
"worker_remove_web_push":
{ Args: { "p_endpoint": string }; Returns: undefined
                           },
"worker_run_saved_search_alerts":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"worker_send_due_broadcasts":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"worker_set_listing_coordinates":
{ Args: { "p_lat": number,"p_listing_id": string,"p_lng": number }; Returns: undefined
                           },
"worker_set_media_hash":
{ Args: { "p_hash": string,"p_media_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "account_status": "active"|"suspended"|"deletion_requested","address_visibility": "exact"|"approximate"|"hidden","app_role": "buyer"|"owner"|"agent"|"moderator"|"administrator"|"builder"|"support"|"marketing"|"crm_manager"|"sales_agent"|"content_manager","area_unit": "sq_m"|"sq_ft"|"acre"|"hectare","broadcast_status": "scheduled"|"sending"|"sent"|"cancelled","data_request_kind": "export"|"deletion","data_request_status": "pending"|"in_progress"|"completed"|"rejected","enquiry_kind": "enquiry"|"visit_request","enquiry_status": "new"|"assigned"|"in_progress"|"qualified"|"visit_scheduled"|"negotiation"|"won"|"lost"|"unqualified"|"responded"|"closed"|"spam","furnishing": "unfurnished"|"semi_furnished"|"furnished","listing_category": "rental"|"resale"|"new_project","listing_purpose": "sale"|"rent","listing_status": "draft"|"pending_review"|"published"|"rejected"|"suspended"|"archived"|"sold"|"rented","location_level": "country"|"region"|"city"|"locality","media_kind": "image"|"document","notification_channel": "email"|"whatsapp"|"push","outbox_status": "pending"|"sent"|"failed"|"skipped_not_configured"|"skipped_preference","possession_status": "upcoming"|"ready"|"under_construction"|"available_from_date","price_display": "show"|"on_request","price_period": "total"|"per_month"|"per_year"|"per_week"|"per_day","video_provider": "youtube"|"instagram","visit_status": "requested"|"confirmed"|"declined"|"cancelled"
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
            "account_status": ["active", "suspended", "deletion_requested"],"address_visibility": ["exact", "approximate", "hidden"],"app_role": ["buyer", "owner", "agent", "moderator", "administrator", "builder", "support", "marketing", "crm_manager", "sales_agent", "content_manager"],"area_unit": ["sq_m", "sq_ft", "acre", "hectare"],"broadcast_status": ["scheduled", "sending", "sent", "cancelled"],"data_request_kind": ["export", "deletion"],"data_request_status": ["pending", "in_progress", "completed", "rejected"],"enquiry_kind": ["enquiry", "visit_request"],"enquiry_status": ["new", "assigned", "in_progress", "qualified", "visit_scheduled", "negotiation", "won", "lost", "unqualified", "responded", "closed", "spam"],"furnishing": ["unfurnished", "semi_furnished", "furnished"],"listing_category": ["rental", "resale", "new_project"],"listing_purpose": ["sale", "rent"],"listing_status": ["draft", "pending_review", "published", "rejected", "suspended", "archived", "sold", "rented"],"location_level": ["country", "region", "city", "locality"],"media_kind": ["image", "document"],"notification_channel": ["email", "whatsapp", "push"],"outbox_status": ["pending", "sent", "failed", "skipped_not_configured", "skipped_preference"],"possession_status": ["upcoming", "ready", "under_construction", "available_from_date"],"price_display": ["show", "on_request"],"price_period": ["total", "per_month", "per_year", "per_week", "per_day"],"video_provider": ["youtube", "instagram"],"visit_status": ["requested", "confirmed", "declined", "cancelled"]
          }
        }
} as const
