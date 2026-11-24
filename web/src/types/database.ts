
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "achievements": {
                  Row: {
                    "badge_icon": string,"code": string,"created_at": string,"description": string,"id": string,"metric": string,"reward_coins": number,"reward_xp": number,"target": number,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "badge_icon": string,"code": string,"created_at"?: string,"description": string,"id"?: string,"metric": string,"reward_coins"?: number,"reward_xp"?: number,"target": number,"title": string
                  }
                  Update: {
                    "badge_icon"?: string,"code"?: string,"created_at"?: string,"description"?: string,"id"?: string,"metric"?: string,"reward_coins"?: number,"reward_xp"?: number,"target"?: number,"title"?: string
                  }
                  Relationships: [
                    
                  ]
                },"card_ownership": {
                  Row: {
                    "acquired_at": string,"acquired_via": Database["public"]['Enums']["acquisition_source"],"card_id": string,"coin_transaction_id": number | null,"id": string,"pack_opening_id": string | null,"pack_position": number | null,"upgrade_level": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acquired_at"?: string,"acquired_via": Database["public"]['Enums']["acquisition_source"],"card_id": string,"coin_transaction_id"?: number | null,"id"?: string,"pack_opening_id"?: string | null,"pack_position"?: number | null,"upgrade_level"?: number,"user_id": string
                  }
                  Update: {
                    "acquired_at"?: string,"acquired_via"?: Database["public"]['Enums']["acquisition_source"],"card_id"?: string,"coin_transaction_id"?: number | null,"id"?: string,"pack_opening_id"?: string | null,"pack_position"?: number | null,"upgrade_level"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "card_ownership_card_id_fkey"
      columns: ["card_id"]
isOneToOne: false
      referencedRelation: "card_catalog"
      referencedColumns: ["card_id"]
    },{
      foreignKeyName: "card_ownership_card_id_fkey"
      columns: ["card_id"]
isOneToOne: false
      referencedRelation: "my_collection"
      referencedColumns: ["card_id"]
    },{
      foreignKeyName: "card_ownership_card_id_fkey"
      columns: ["card_id"]
isOneToOne: false
      referencedRelation: "player_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "card_ownership_coin_transaction_id_fkey"
      columns: ["coin_transaction_id"]
isOneToOne: true
      referencedRelation: "coin_transactions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "card_ownership_pack_opening_id_fkey"
      columns: ["pack_opening_id"]
isOneToOne: false
      referencedRelation: "pack_openings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "card_ownership_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"card_pack_odds": {
                  Row: {
                    "pack_id": string,"rarity": Database["public"]['Enums']["card_rarity"],"weight": number
                  }
                  ComputedFields: never
                  Insert: {
                    "pack_id": string,"rarity": Database["public"]['Enums']["card_rarity"],"weight": number
                  }
                  Update: {
                    "pack_id"?: string,"rarity"?: Database["public"]['Enums']["card_rarity"],"weight"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "card_pack_odds_pack_id_fkey"
      columns: ["pack_id"]
isOneToOne: false
      referencedRelation: "card_packs"
      referencedColumns: ["id"]
    }
                  ]
                },"card_packs": {
                  Row: {
                    "cards_per_pack": number,"code": string,"created_at": string,"daily_limit": number,"description": string,"guaranteed_rarity": Database["public"]['Enums']["card_rarity"] | null,"id": string,"is_active": boolean,"name": string,"price": number,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cards_per_pack": number,"code": string,"created_at"?: string,"daily_limit"?: number,"description": string,"guaranteed_rarity"?: Database["public"]['Enums']["card_rarity"] | null,"id"?: string,"is_active"?: boolean,"name": string,"price": number,"sort_order"?: number
                  }
                  Update: {
                    "cards_per_pack"?: number,"code"?: string,"created_at"?: string,"daily_limit"?: number,"description"?: string,"guaranteed_rarity"?: Database["public"]['Enums']["card_rarity"] | null,"id"?: string,"is_active"?: boolean,"name"?: string,"price"?: number,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"challenges": {
                  Row: {
                    "code": string,"created_at": string,"description": string,"id": string,"is_active": boolean,"metric": string,"period": Database["public"]['Enums']["challenge_period"],"reward_coins": number,"reward_xp": number,"target": number,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"description": string,"id"?: string,"is_active"?: boolean,"metric": string,"period": Database["public"]['Enums']["challenge_period"],"reward_coins"?: number,"reward_xp"?: number,"target": number,"title": string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"description"?: string,"id"?: string,"is_active"?: boolean,"metric"?: string,"period"?: Database["public"]['Enums']["challenge_period"],"reward_coins"?: number,"reward_xp"?: number,"target"?: number,"title"?: string
                  }
                  Relationships: [
                    
                  ]
                },"coin_transactions": {
                  Row: {
                    "amount": number,"balance_after": number,"created_at": string,"id": number,"idempotency_key": string,"reference_id": string | null,"reference_type": string | null,"tx_type": Database["public"]['Enums']["coin_tx_type"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"balance_after": number,"created_at"?: string,"id"?: never,"idempotency_key": string,"reference_id"?: string | null,"reference_type"?: string | null,"tx_type": Database["public"]['Enums']["coin_tx_type"],"user_id": string
                  }
                  Update: {
                    "amount"?: number,"balance_after"?: number,"created_at"?: string,"id"?: never,"idempotency_key"?: string,"reference_id"?: string | null,"reference_type"?: string | null,"tx_type"?: Database["public"]['Enums']["coin_tx_type"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "coin_transactions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "wallets"
      referencedColumns: ["user_id"]
    }
                  ]
                },"formation_slots": {
                  Row: {
                    "formation": Database["public"]['Enums']["formation_code"],"position": Database["public"]['Enums']["player_position"],"slot": number,"x": number,"y": number
                  }
                  ComputedFields: never
                  Insert: {
                    "formation": Database["public"]['Enums']["formation_code"],"position": Database["public"]['Enums']["player_position"],"slot": number,"x": number,"y": number
                  }
                  Update: {
                    "formation"?: Database["public"]['Enums']["formation_code"],"position"?: Database["public"]['Enums']["player_position"],"slot"?: number,"x"?: number,"y"?: number
                  }
                  Relationships: [
                    
                  ]
                },"match_events": {
                  Row: {
                    "assist_ownership_id": string | null,"assist_player_name": string | null,"detail": string | null,"event_type": Database["public"]['Enums']["match_event_type"],"id": number,"match_id": string,"minute": number,"ownership_id": string | null,"player_name": string | null,"seq": number,"side": Database["public"]['Enums']["match_side"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "assist_ownership_id"?: string | null,"assist_player_name"?: string | null,"detail"?: string | null,"event_type": Database["public"]['Enums']["match_event_type"],"id"?: never,"match_id": string,"minute": number,"ownership_id"?: string | null,"player_name"?: string | null,"seq": number,"side"?: Database["public"]['Enums']["match_side"] | null
                  }
                  Update: {
                    "assist_ownership_id"?: string | null,"assist_player_name"?: string | null,"detail"?: string | null,"event_type"?: Database["public"]['Enums']["match_event_type"],"id"?: never,"match_id"?: string,"minute"?: number,"ownership_id"?: string | null,"player_name"?: string | null,"seq"?: number,"side"?: Database["public"]['Enums']["match_side"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "match_events_assist_ownership_id_fkey"
      columns: ["assist_ownership_id"]
isOneToOne: false
      referencedRelation: "card_ownership"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "match_events_assist_ownership_id_fkey"
      columns: ["assist_ownership_id"]
isOneToOne: false
      referencedRelation: "my_collection"
      referencedColumns: ["ownership_id"]
    },{
      foreignKeyName: "match_events_match_id_fkey"
      columns: ["match_id"]
isOneToOne: false
      referencedRelation: "matches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "match_events_ownership_id_fkey"
      columns: ["ownership_id"]
isOneToOne: false
      referencedRelation: "card_ownership"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "match_events_ownership_id_fkey"
      columns: ["ownership_id"]
isOneToOne: false
      referencedRelation: "my_collection"
      referencedColumns: ["ownership_id"]
    }
                  ]
                },"matches": {
                  Row: {
                    "away_score": number,"completed_at": string | null,"created_at": string,"engine_version": string,"home_score": number,"id": string,"opponent_name": string,"opponent_rating": number,"reward_coins": number,"seed": number,"stats": NonNullable<Json>,"status": Database["public"]['Enums']["match_status"],"tactic": Database["public"]['Enums']["match_tactic"],"team_id": string | null,"team_snapshot": NonNullable<Json>,"user_id": string,"xp_gained": number
                  }
                  ComputedFields: never
                  Insert: {
                    "away_score"?: number,"completed_at"?: string | null,"created_at"?: string,"engine_version": string,"home_score"?: number,"id"?: string,"opponent_name": string,"opponent_rating": number,"reward_coins"?: number,"seed": number,"stats"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["match_status"],"tactic": Database["public"]['Enums']["match_tactic"],"team_id"?: string | null,"team_snapshot"?: NonNullable<Json>,"user_id": string,"xp_gained"?: number
                  }
                  Update: {
                    "away_score"?: number,"completed_at"?: string | null,"created_at"?: string,"engine_version"?: string,"home_score"?: number,"id"?: string,"opponent_name"?: string,"opponent_rating"?: number,"reward_coins"?: number,"seed"?: number,"stats"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["match_status"],"tactic"?: Database["public"]['Enums']["match_tactic"],"team_id"?: string | null,"team_snapshot"?: NonNullable<Json>,"user_id"?: string,"xp_gained"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "matches_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "matches_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"pack_openings": {
                  Row: {
                    "coin_transaction_id": number,"created_at": string,"id": string,"pack_id": string,"price_paid": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "coin_transaction_id": number,"created_at"?: string,"id"?: string,"pack_id": string,"price_paid": number,"user_id": string
                  }
                  Update: {
                    "coin_transaction_id"?: number,"created_at"?: string,"id"?: string,"pack_id"?: string,"price_paid"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pack_openings_coin_transaction_id_fkey"
      columns: ["coin_transaction_id"]
isOneToOne: true
      referencedRelation: "coin_transactions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pack_openings_pack_id_fkey"
      columns: ["pack_id"]
isOneToOne: false
      referencedRelation: "card_packs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pack_openings_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"player_cards": {
                  Row: {
                    "created_at": string,"defending": number,"dribbling": number,"edition": string,"id": string,"is_purchasable": boolean,"market_price": number,"overall": number,"pace": number,"passing": number,"physicality": number,"player_id": string,"position": Database["public"]['Enums']["player_position"],"preferred_foot": Database["public"]['Enums']["preferred_foot"],"rarity": Database["public"]['Enums']["card_rarity"],"shooting": number,"skill_moves": number,"weak_foot": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"defending": number,"dribbling": number,"edition"?: string,"id"?: string,"is_purchasable"?: boolean,"market_price": number,"overall": number,"pace": number,"passing": number,"physicality": number,"player_id": string,"position": Database["public"]['Enums']["player_position"],"preferred_foot": Database["public"]['Enums']["preferred_foot"],"rarity": Database["public"]['Enums']["card_rarity"],"shooting": number,"skill_moves": number,"weak_foot": number
                  }
                  Update: {
                    "created_at"?: string,"defending"?: number,"dribbling"?: number,"edition"?: string,"id"?: string,"is_purchasable"?: boolean,"market_price"?: number,"overall"?: number,"pace"?: number,"passing"?: number,"physicality"?: number,"player_id"?: string,"position"?: Database["public"]['Enums']["player_position"],"preferred_foot"?: Database["public"]['Enums']["preferred_foot"],"rarity"?: Database["public"]['Enums']["card_rarity"],"shooting"?: number,"skill_moves"?: number,"weak_foot"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "player_cards_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"players": {
                  Row: {
                    "biography": string,"birth_date": string,"career_summary": NonNullable<Json>,"club": string,"created_at": string,"data_source": string,"first_name": string,"height_cm": number | null,"id": string,"image_path": string | null,"is_fictional": boolean,"known_as": string | null,"last_name": string,"license_ref": string | null,"nationality": string,"primary_position": Database["public"]['Enums']["player_position"]
                  }
                  ComputedFields: never
                  Insert: {
                    "biography"?: string,"birth_date": string,"career_summary"?: NonNullable<Json>,"club": string,"created_at"?: string,"data_source"?: string,"first_name": string,"height_cm"?: number | null,"id"?: string,"image_path"?: string | null,"is_fictional"?: boolean,"known_as"?: string | null,"last_name": string,"license_ref"?: string | null,"nationality": string,"primary_position": Database["public"]['Enums']["player_position"]
                  }
                  Update: {
                    "biography"?: string,"birth_date"?: string,"career_summary"?: NonNullable<Json>,"club"?: string,"created_at"?: string,"data_source"?: string,"first_name"?: string,"height_cm"?: number | null,"id"?: string,"image_path"?: string | null,"is_fictional"?: boolean,"known_as"?: string | null,"last_name"?: string,"license_ref"?: string | null,"nationality"?: string,"primary_position"?: Database["public"]['Enums']["player_position"]
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "avatar_key": string,"created_at": string,"display_name": string | null,"id": string,"level": number,"updated_at": string,"username": string,"xp": number
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_key"?: string,"created_at"?: string,"display_name"?: string | null,"id": string,"level"?: number,"updated_at"?: string,"username": string,"xp"?: number
                  }
                  Update: {
                    "avatar_key"?: string,"created_at"?: string,"display_name"?: string | null,"id"?: string,"level"?: number,"updated_at"?: string,"username"?: string,"xp"?: number
                  }
                  Relationships: [
                    
                  ]
                },"stadium_upgrade_costs": {
                  Row: {
                    "bonus_pct": number,"category": Database["public"]['Enums']["stadium_upgrade_category"],"cost": number,"description": string,"level": number
                  }
                  ComputedFields: never
                  Insert: {
                    "bonus_pct": number,"category": Database["public"]['Enums']["stadium_upgrade_category"],"cost": number,"description": string,"level": number
                  }
                  Update: {
                    "bonus_pct"?: number,"category"?: Database["public"]['Enums']["stadium_upgrade_category"],"cost"?: number,"description"?: string,"level"?: number
                  }
                  Relationships: [
                    
                  ]
                },"stadium_upgrades": {
                  Row: {
                    "category": Database["public"]['Enums']["stadium_upgrade_category"],"coin_transaction_id": number,"cost": number,"created_at": string,"from_level": number,"id": number,"stadium_id": string,"to_level": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": Database["public"]['Enums']["stadium_upgrade_category"],"coin_transaction_id": number,"cost": number,"created_at"?: string,"from_level": number,"id"?: never,"stadium_id": string,"to_level": number,"user_id": string
                  }
                  Update: {
                    "category"?: Database["public"]['Enums']["stadium_upgrade_category"],"coin_transaction_id"?: number,"cost"?: number,"created_at"?: string,"from_level"?: number,"id"?: never,"stadium_id"?: string,"to_level"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stadium_upgrades_coin_transaction_id_fkey"
      columns: ["coin_transaction_id"]
isOneToOne: true
      referencedRelation: "coin_transactions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stadium_upgrades_stadium_id_fkey"
      columns: ["stadium_id"]
isOneToOne: false
      referencedRelation: "stadiums"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stadium_upgrades_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"stadiums": {
                  Row: {
                    "capacity": number | null,"created_at": string,"design_template": string,"facilities_level": number,"id": string,"lighting_level": number,"name": string,"pitch_level": number,"seating_level": number,"stadium_level": number | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "capacity"?: never,"created_at"?: string,"design_template"?: string,"facilities_level"?: number,"id"?: string,"lighting_level"?: number,"name": string,"pitch_level"?: number,"seating_level"?: number,"stadium_level"?: never,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "capacity"?: never,"created_at"?: string,"design_template"?: string,"facilities_level"?: number,"id"?: string,"lighting_level"?: number,"name"?: string,"pitch_level"?: number,"seating_level"?: number,"stadium_level"?: never,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stadiums_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"team_players": {
                  Row: {
                    "ownership_id": string,"slot": number,"team_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ownership_id": string,"slot": number,"team_id": string,"user_id"?: string
                  }
                  Update: {
                    "ownership_id"?: string,"slot"?: number,"team_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "team_players_ownership_id_user_id_fkey"
      columns: ["ownership_id","user_id"]
isOneToOne: false
      referencedRelation: "card_ownership"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "team_players_ownership_id_user_id_fkey"
      columns: ["ownership_id","user_id"]
isOneToOne: false
      referencedRelation: "my_collection"
      referencedColumns: ["ownership_id","user_id"]
    },{
      foreignKeyName: "team_players_team_id_user_id_fkey"
      columns: ["team_id","user_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"teams": {
                  Row: {
                    "captain_ownership_id": string | null,"created_at": string,"formation": Database["public"]['Enums']["formation_code"],"id": string,"is_active": boolean,"logo_template": string,"name": string,"primary_color": string,"secondary_color": string,"tactic": Database["public"]['Enums']["match_tactic"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "captain_ownership_id"?: string | null,"created_at"?: string,"formation"?: Database["public"]['Enums']["formation_code"],"id"?: string,"is_active"?: boolean,"logo_template"?: string,"name": string,"primary_color"?: string,"secondary_color"?: string,"tactic"?: Database["public"]['Enums']["match_tactic"],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "captain_ownership_id"?: string | null,"created_at"?: string,"formation"?: Database["public"]['Enums']["formation_code"],"id"?: string,"is_active"?: boolean,"logo_template"?: string,"name"?: string,"primary_color"?: string,"secondary_color"?: string,"tactic"?: Database["public"]['Enums']["match_tactic"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "teams_captain_owned_fk"
      columns: ["captain_ownership_id","user_id"]
isOneToOne: false
      referencedRelation: "card_ownership"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "teams_captain_owned_fk"
      columns: ["captain_ownership_id","user_id"]
isOneToOne: false
      referencedRelation: "my_collection"
      referencedColumns: ["ownership_id","user_id"]
    },{
      foreignKeyName: "teams_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_achievements": {
                  Row: {
                    "achievement_id": string,"claimed_at": string | null,"unlocked_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "achievement_id": string,"claimed_at"?: string | null,"unlocked_at"?: string,"user_id": string
                  }
                  Update: {
                    "achievement_id"?: string,"claimed_at"?: string | null,"unlocked_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_achievements_achievement_id_fkey"
      columns: ["achievement_id"]
isOneToOne: false
      referencedRelation: "achievements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_achievements_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_challenges": {
                  Row: {
                    "challenge_id": string,"claimed_at": string | null,"completed_at": string | null,"period_start": string,"progress": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "challenge_id": string,"claimed_at"?: string | null,"completed_at"?: string | null,"period_start": string,"progress"?: number,"user_id": string
                  }
                  Update: {
                    "challenge_id"?: string,"claimed_at"?: string | null,"completed_at"?: string | null,"period_start"?: string,"progress"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_challenges_challenge_id_fkey"
      columns: ["challenge_id"]
isOneToOne: false
      referencedRelation: "challenges"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_challenges_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"wallets": {
                  Row: {
                    "balance": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "balance"?: number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "balance"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "wallets_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "card_catalog": {
                  Row: {
                    "biography": string,"birth_date": string,"card_id": string,"career_summary": NonNullable<Json>,"club": string,"defending": number,"display_name": string | null,"dribbling": number,"edition": string,"first_name": string,"height_cm": number | null,"image_path": string | null,"is_fictional": boolean,"is_purchasable": boolean,"known_as": string | null,"last_name": string,"market_price": number,"nationality": string,"overall": number,"pace": number,"passing": number,"physicality": number,"player_id": string,"position": Database["public"]['Enums']["player_position"],"preferred_foot": Database["public"]['Enums']["preferred_foot"],"rarity": Database["public"]['Enums']["card_rarity"],"search_name": string | null,"shooting": number,"skill_moves": number,"weak_foot": number
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "player_cards_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"my_collection": {
                  Row: {
                    "acquired_at": string,"acquired_via": Database["public"]['Enums']["acquisition_source"],"card_id": string,"club": string,"defending": number,"display_name": string | null,"dribbling": number,"first_name": string,"image_path": string | null,"is_starter": boolean | null,"known_as": string | null,"last_name": string,"market_price": number,"nationality": string,"overall": number,"ownership_id": string,"pace": number,"passing": number,"physicality": number,"player_id": string,"position": Database["public"]['Enums']["player_position"],"preferred_foot": Database["public"]['Enums']["preferred_foot"],"rarity": Database["public"]['Enums']["card_rarity"],"search_name": string | null,"shooting": number,"skill_moves": number,"upgrade_level": number,"user_id": string,"weak_foot": number
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "card_ownership_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "player_cards_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "buy_card":
{ Args: { "p_card_id": string,"p_idempotency_key": string }; Returns: string
                           },
"create_team":
{ Args: { "p_copy_from"?: string,"p_logo_template"?: string,"p_name": string,"p_primary_color"?: string,"p_secondary_color"?: string }; Returns: string
                           },
"delete_team":
{ Args: { "p_team_id": string }; Returns: undefined
                           },
"is_username_available":
{ Args: { "p_username": string }; Returns: boolean
                           },
"open_pack":
{ Args: { "p_idempotency_key": string,"p_pack_id": string }; Returns: string
                           },
"rarity_rank":
{ Args: { "p": Database["public"]['Enums']["card_rarity"] }; Returns: number
                           },
"save_lineup":
{ Args: { "p_captain": string,"p_formation": Database["public"]['Enums']["formation_code"],"p_slots": Json,"p_tactic": Database["public"]['Enums']["match_tactic"],"p_team_id": string }; Returns: undefined
                           },
"search_key":
{ Args: { "p_text": string }; Returns: string
                           },
"set_active_team":
{ Args: { "p_team_id": string }; Returns: undefined
                           },
"upgrade_stadium":
{ Args: { "p_category": Database["public"]['Enums']["stadium_upgrade_category"],"p_expected_level": number,"p_idempotency_key": string }; Returns: number
                           }
          }
          Enums: {
            "acquisition_source": "starter"|"pack"|"market"|"reward","card_rarity": "common"|"rare"|"epic"|"legendary"|"icon","challenge_period": "daily"|"weekly"|"team_building"|"milestone","coin_tx_type": "signup_bonus"|"match_reward"|"challenge_reward"|"achievement_reward"|"card_purchase"|"pack_purchase"|"stadium_upgrade"|"admin_adjustment","formation_code": "4-3-3"|"4-4-2"|"3-5-2"|"4-2-3-1","match_event_type": "kickoff"|"goal"|"own_goal"|"chance"|"save"|"yellow_card"|"red_card"|"substitution"|"injury"|"half_time"|"full_time","match_side": "home"|"away","match_status": "in_progress"|"completed"|"abandoned","match_tactic": "balanced"|"attacking"|"defensive","player_position": "GK"|"CB"|"LB"|"RB"|"CDM"|"CM"|"CAM"|"LM"|"RM"|"LW"|"RW"|"ST","preferred_foot": "left"|"right","stadium_upgrade_category": "seating"|"lighting"|"pitch"|"facilities"
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
            "acquisition_source": ["starter", "pack", "market", "reward"],"card_rarity": ["common", "rare", "epic", "legendary", "icon"],"challenge_period": ["daily", "weekly", "team_building", "milestone"],"coin_tx_type": ["signup_bonus", "match_reward", "challenge_reward", "achievement_reward", "card_purchase", "pack_purchase", "stadium_upgrade", "admin_adjustment"],"formation_code": ["4-3-3", "4-4-2", "3-5-2", "4-2-3-1"],"match_event_type": ["kickoff", "goal", "own_goal", "chance", "save", "yellow_card", "red_card", "substitution", "injury", "half_time", "full_time"],"match_side": ["home", "away"],"match_status": ["in_progress", "completed", "abandoned"],"match_tactic": ["balanced", "attacking", "defensive"],"player_position": ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "ST"],"preferred_foot": ["left", "right"],"stadium_upgrade_category": ["seating", "lighting", "pitch", "facilities"]
          }
        }
} as const
