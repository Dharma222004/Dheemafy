package com.dheemafy.music.data.model

import com.google.gson.annotations.SerializedName

data class Song(
    @SerializedName("id") val id: String,
    @SerializedName("title") val title: String,
    @SerializedName("artist") val artist: String? = null,
    @SerializedName("artists") val artists: List<String>? = null,
    @SerializedName("album") val album: String? = null,
    @SerializedName("movie") val movie: String? = null,
    @SerializedName("duration") val duration: Long? = 0L,
    @SerializedName("audioUrl") val audioUrl: String? = null,
    @SerializedName("audio_url") val audioUrlAlt: String? = null,
    @SerializedName("coverImageUrl") val coverImageUrl: String? = null,
    @SerializedName("cover_image_url") val coverImageUrlAlt: String? = null,
    @SerializedName("cloudinaryPublicId") val cloudinaryPublicId: String? = null,
    @SerializedName("genre") val genre: String? = null,
    @SerializedName("language") val language: String? = null,
    @SerializedName("folder") val folder: String? = null,
    @SerializedName("is_liked") val isLiked: Boolean = false
) {
    val resolvedAudioUrl: String
        get() = audioUrl ?: audioUrlAlt ?: ""

    val resolvedCoverImageUrl: String
        get() = coverImageUrl ?: coverImageUrlAlt ?: ""

    val displayArtist: String
        get() = artist ?: artists?.joinToString(", ") ?: "Unknown Artist"

    val displaySubtext: String
        get() {
            val parts = mutableListOf<String>()
            displayArtist.takeIf { it.isNotBlank() }?.let { parts.add(it) }
            movie?.takeIf { it.isNotBlank() }?.let { parts.add("From \"$it\"") }
                ?: album?.takeIf { it.isNotBlank() }?.let { parts.add(it) }
            return parts.joinToString(" • ")
        }
}

data class Playlist(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("comment") val comment: String? = null,
    @SerializedName("duration") val duration: Long? = 0L,
    @SerializedName("song_count") val songCount: Int? = 0,
    @SerializedName("uploaded_image") val uploadedImage: String? = null
)

data class PlaylistDetail(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("comment") val comment: String? = null,
    @SerializedName("duration") val duration: Long? = 0L,
    @SerializedName("song_count") val songCount: Int? = 0,
    @SerializedName("tracks") val tracks: List<Song> = emptyList()
)

data class Artist(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("slug") val slug: String? = null,
    @SerializedName("large_image_url") val largeImageUrl: String? = null,
    @SerializedName("song_count") val songCount: Int? = 0
)

data class ArtistDetail(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("slug") val slug: String? = null,
    @SerializedName("large_image_url") val largeImageUrl: String? = null,
    @SerializedName("song_count") val songCount: Int? = 0,
    @SerializedName("songs") val songs: List<Song> = emptyList(),
    @SerializedName("popularSongs") val popularSongs: List<Song> = emptyList(),
    @SerializedName("albums") val albums: List<Album> = emptyList()
)

data class Album(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("album_artist") val albumArtist: String? = null,
    @SerializedName("large_image_url") val largeImageUrl: String? = null,
    @SerializedName("song_count") val songCount: Int? = 0
)

data class User(
    @SerializedName("id") val id: String,
    @SerializedName("userName") val userName: String,
    @SerializedName("name") val name: String? = null,
    @SerializedName("email") val email: String? = null,
    @SerializedName("isAdmin") val isAdmin: Boolean? = false
)

data class AuthData(
    @SerializedName("token") val token: String,
    @SerializedName("user") val user: User
)

data class ApiResponse<T>(
    @SerializedName("data") val data: T? = null,
    @SerializedName("error") val error: ApiError? = null
)

data class ApiError(
    @SerializedName("code") val code: String? = null,
    @SerializedName("message") val message: String? = null
)

data class HomeData(
    @SerializedName("quickPicks") val quickPicks: List<Song> = emptyList(),
    @SerializedName("trending") val trending: List<Song> = emptyList(),
    @SerializedName("tamilHits") val tamilHits: List<Song> = emptyList(),
    @SerializedName("newAdditions") val newAdditions: List<Song> = emptyList(),
    @SerializedName("popularArtists") val popularArtists: List<Artist> = emptyList(),
    @SerializedName("popularAlbums") val popularAlbums: List<Album> = emptyList(),
    @SerializedName("featuredPlaylists") val featuredPlaylists: List<Playlist> = emptyList()
)

data class SearchData(
    @SerializedName("query") val query: String? = null,
    @SerializedName("songs") val songs: List<Song> = emptyList(),
    @SerializedName("artists") val artists: List<Artist> = emptyList(),
    @SerializedName("albums") val albums: List<Album> = emptyList()
)

data class LoginRequest(
    val username: String,
    val password: String
)

data class PlaybackRecordRequest(
    val songId: String,
    val durationPlayed: Int,
    val completed: Boolean
)
