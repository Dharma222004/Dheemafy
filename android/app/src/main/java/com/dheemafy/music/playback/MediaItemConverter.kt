package com.dheemafy.music.playback

import android.net.Uri
import android.os.Bundle
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import com.dheemafy.music.data.model.Song

object MediaItemConverter {

    private const val KEY_SONG_ID = "song_id"
    private const val KEY_ALBUM = "album"
    private const val KEY_MOVIE = "movie"
    private const val KEY_DURATION = "duration"
    private const val KEY_AUDIO_URL = "audio_url"
    private const val KEY_COVER_URL = "cover_url"
    private const val KEY_FOLDER = "folder"
    private const val KEY_IS_LIKED = "is_liked"

    fun toMediaItem(song: Song): MediaItem {
        val audioUri = Uri.parse(song.resolvedAudioUrl)
        val artworkUri = song.resolvedCoverImageUrl.takeIf { it.isNotBlank() }?.let { Uri.parse(it) }

        val extras = Bundle().apply {
            putString(KEY_SONG_ID, song.id)
            putString(KEY_ALBUM, song.album)
            putString(KEY_MOVIE, song.movie)
            putLong(KEY_DURATION, song.duration ?: 0L)
            putString(KEY_AUDIO_URL, song.resolvedAudioUrl)
            putString(KEY_COVER_URL, song.resolvedCoverImageUrl)
            putString(KEY_FOLDER, song.folder)
            putBoolean(KEY_IS_LIKED, song.isLiked)
        }

        val metadata = MediaMetadata.Builder()
            .setTitle(song.title)
            .setArtist(song.displayArtist)
            .setAlbumTitle(song.movie ?: song.album)
            .setArtworkUri(artworkUri)
            .setExtras(extras)
            .build()

        return MediaItem.Builder()
            .setMediaId(song.id)
            .setUri(audioUri)
            .setMediaMetadata(metadata)
            .build()
    }

    fun toSong(mediaItem: MediaItem): Song {
        val metadata = mediaItem.mediaMetadata
        val extras = metadata.extras

        val id = extras?.getString(KEY_SONG_ID) ?: mediaItem.mediaId
        val title = metadata.title?.toString() ?: "Unknown Title"
        val artist = metadata.artist?.toString()
        val album = extras?.getString(KEY_ALBUM) ?: metadata.albumTitle?.toString()
        val movie = extras?.getString(KEY_MOVIE)
        val duration = extras?.getLong(KEY_DURATION) ?: 0L
        val audioUrl = extras?.getString(KEY_AUDIO_URL) ?: mediaItem.requestMetadata.mediaUri?.toString()
        val coverUrl = extras?.getString(KEY_COVER_URL) ?: metadata.artworkUri?.toString()
        val folder = extras?.getString(KEY_FOLDER)
        val isLiked = extras?.getBoolean(KEY_IS_LIKED) ?: false

        return Song(
            id = id,
            title = title,
            artist = artist,
            album = album,
            movie = movie,
            duration = duration,
            audioUrl = audioUrl,
            coverImageUrl = coverUrl,
            folder = folder,
            isLiked = isLiked
        )
    }

    fun toMediaItems(songs: List<Song>): List<MediaItem> {
        return songs.map { toMediaItem(it) }
    }
}
