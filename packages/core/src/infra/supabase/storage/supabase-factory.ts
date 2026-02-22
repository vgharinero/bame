import { GameStorageAdapter } from "../../../engine/storage/adapters";
import type { SupabaseDataSource } from "./supabase-source";

class SupabaseStorageFactory {
  private dataSource: SupabaseDataSource;
  
  constructor(supabaseUrl: string, supabaseKey: string) {
    this.dataSource = new SupabaseDataSource(
      createClient(supabaseUrl, supabaseKey)
    );
  }
  
  createGameStorage(): GameStorageAdapter {
    return new GameStorageAdapter(this.dataSource);
  }
  
  createLobbyStorage(): LobbyStorage {
    return new LobbyStorage(this.dataSource);
  }
  
  createUserStorage(): UserStorage {
    return new UserStorage(this.dataSource);
  }
}