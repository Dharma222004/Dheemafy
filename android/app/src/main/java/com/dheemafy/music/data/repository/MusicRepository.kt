package com.dheemafy.music.data.repository

import com.dheemafy.music.data.api.ApiClient
import com.dheemafy.music.data.local.SessionManager
import com.dheemafy.music.data.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class MusicRepository(
    private val apiClient: ApiClient,
    private val sessionManager: SessionManager
) {

    suspend fun login(username: String, password: String): Result<AuthData> = withContext(Dispatchers.IO) {
        try {
            val response = apiClient.service.login(LoginRequest(username, password))
            if (response.isSuccessful && response.body()?.data != null) {
                val authData = response.body()!!.data!!
                sessionManager.saveAuthData(authData.token, authData.user)
                Result.success(authData)
            } else {
                val errorMsg = response.body()?.error?.message ?: response.message() ?: "Authentication failed"
                Result.failure(Exception(errorMsg))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getHome(): Result<HomeData> = withContext(Dispatchers.IO) {
        try {
            val response = apiClient.service.getHome()
            if (response.isSuccessful && response.body()?.data != null) {
                Result.success(response.body()!!.data!!)
            } else {
                Result.failure(Exception(response.message() ?: "Failed to load home feed"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getSongs(folder: String? = null, artist: String? = null, limit: Int = 100): Result<List<Song>> = withContext(Dispatchers.IO) {
        try {
            val response = apiClient.service.getSongs(folder = folder, artist = artist, limit = limit)
            if (response.isSuccessful && response.body()?.data != null) {
                Result.success(response.body()!!.data!!)
            } else {
                Result.failure(Exception(response.message() ?: "Failed to load songs"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getPlaylist(id: String): Result<PlaylistDetail> = withContext(Dispatchers.IO) {
        try {
            val response = apiClient.service.getPlaylist(id)
            if (response.isSuccessful && response.body()?.data != null) {
                Result.success(response.body()!!.data!!)
            } else {
                Result.failure(Exception(response.message() ?: "Failed to load playlist"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getPlaylists(): Result<List<Playlist>> = withContext(Dispatchers.IO) {
        try {
            val response = apiClient.service.getPlaylists()
            if (response.isSuccessful && response.body()?.data != null) {
                Result.success(response.body()!!.data!!)
            } else {
                Result.failure(Exception(response.message() ?: "Failed to load playlists"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getArtist(slugOrId: String): Result<ArtistDetail> = withContext(Dispatchers.IO) {
        try {
            val response = apiClient.service.getArtist(slugOrId)
            if (response.isSuccessful && response.body()?.data != null) {
                Result.success(response.body()!!.data!!)
            } else {
                Result.failure(Exception(response.message() ?: "Failed to load artist"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun search(query: String): Result<SearchData> = withContext(Dispatchers.IO) {
        try {
            val response = apiClient.service.search(query)
            if (response.isSuccessful && response.body()?.data != null) {
                Result.success(response.body()!!.data!!)
            } else {
                Result.failure(Exception(response.message() ?: "Search request failed"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun toggleLike(songId: String, currentlyLiked: Boolean): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val response = if (currentlyLiked) {
                apiClient.service.unlikeSong(songId)
            } else {
                apiClient.service.likeSong(songId)
            }
            if (response.isSuccessful) {
                Result.success(Unit)
            } else {
                Result.failure(Exception("Failed to update like status"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun recordPlayback(songId: String, durationPlayed: Int, completed: Boolean): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val response = apiClient.service.recordPlayback(PlaybackRecordRequest(songId, durationPlayed, completed))
            if (response.isSuccessful) {
                Result.success(Unit)
            } else {
                Result.failure(Exception("Failed to record playback"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun logout() {
        sessionManager.logout()
    }
}
