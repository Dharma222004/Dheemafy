package com.dheemafy.music.data.local

import android.content.Context
import android.content.SharedPreferences
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.UUID

data class UserPlaylist(
    val id: String,
    val name: String,
    val songIds: List<String> = emptyList(),
    val createdAt: Long = System.currentTimeMillis()
)

class UserPlaylistManager(context: Context) {

    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val gson = Gson()

    private val _playlists = MutableStateFlow<List<UserPlaylist>>(loadPlaylists())
    val playlists: StateFlow<List<UserPlaylist>> = _playlists.asStateFlow()

    private fun loadPlaylists(): List<UserPlaylist> {
        val json = prefs.getString(KEY_PLAYLISTS, null) ?: return emptyList()
        return try {
            val type = object : TypeToken<List<UserPlaylist>>() {}.type
            gson.fromJson<List<UserPlaylist>>(json, type) ?: emptyList()
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun savePlaylists(list: List<UserPlaylist>) {
        val json = gson.toJson(list)
        prefs.edit().putString(KEY_PLAYLISTS, json).apply()
        _playlists.value = list
    }

    fun getAll(): List<UserPlaylist> = _playlists.value

    fun getById(id: String): UserPlaylist? {
        return _playlists.value.find { it.id == id }
    }

    fun createPlaylist(name: String): UserPlaylist {
        val cleanName = name.trim().ifEmpty { "My Playlist" }
        val newPl = UserPlaylist(
            id = "upl_" + UUID.randomUUID().toString().take(8),
            name = cleanName,
            songIds = emptyList(),
            createdAt = System.currentTimeMillis()
        )
        val current = _playlists.value.toMutableList()
        current.add(0, newPl) // newest in first place!
        savePlaylists(current)
        return newPl
    }

    fun deletePlaylist(id: String) {
        val current = _playlists.value.toMutableList()
        current.removeAll { it.id == id }
        savePlaylists(current)
    }

    fun addSongToPlaylist(playlistId: String, songId: String) {
        val current = _playlists.value.map { pl ->
            if (pl.id == playlistId) {
                if (!pl.songIds.contains(songId)) {
                    pl.copy(songIds = pl.songIds + songId)
                } else pl
            } else pl
        }
        savePlaylists(current)
    }

    fun removeSongFromPlaylist(playlistId: String, songId: String) {
        val current = _playlists.value.map { pl ->
            if (pl.id == playlistId) {
                pl.copy(songIds = pl.songIds - songId)
            } else pl
        }
        savePlaylists(current)
    }

    fun toggleSongInPlaylist(playlistId: String, songId: String): Boolean {
        val pl = getById(playlistId) ?: return false
        val contains = pl.songIds.contains(songId)
        if (contains) {
            removeSongFromPlaylist(playlistId, songId)
            return false
        } else {
            addSongToPlaylist(playlistId, songId)
            return true
        }
    }

    fun isSongInPlaylist(playlistId: String, songId: String): Boolean {
        return getById(playlistId)?.songIds?.contains(songId) == true
    }

    companion object {
        private const val PREFS_NAME = "dheemafy_user_playlists_prefs"
        private const val KEY_PLAYLISTS = "user_playlists_data"
    }
}
