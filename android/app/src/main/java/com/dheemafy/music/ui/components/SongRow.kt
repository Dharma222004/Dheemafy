package com.dheemafy.music.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.dheemafy.music.data.model.Song
import com.dheemafy.music.ui.theme.SpotifyGrayText
import com.dheemafy.music.ui.theme.SpotifyGreen
import com.dheemafy.music.ui.theme.SpotifyWhite

@Composable
fun SongRow(
    song: Song,
    isCurrentSong: Boolean,
    isPlaying: Boolean,
    onSongClick: () -> Unit,
    onLikeClick: () -> Unit = {},
    modifier: Modifier = Modifier,
    index: Int? = null
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable { onSongClick() }
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (index != null) {
            Text(
                text = "${index + 1}",
                color = if (isCurrentSong) SpotifyGreen else SpotifyGrayText,
                fontSize = 14.sp,
                fontWeight = if (isCurrentSong) FontWeight.Bold else FontWeight.Normal,
                modifier = Modifier.width(28.dp)
            )
        }

        SongCoverImage(
            rawUrl = song.resolvedCoverImageUrl,
            title = song.title,
            size = 48.dp,
            shape = RoundedCornerShape(4.dp)
        )

        Spacer(modifier = Modifier.width(12.dp))

        Column(
            modifier = Modifier.weight(1f)
        ) {
            Text(
                text = song.title,
                color = if (isCurrentSong) SpotifyGreen else SpotifyWhite,
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = song.displaySubtext,
                color = SpotifyGrayText,
                fontSize = 13.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }

        IconButton(onClick = onLikeClick) {
            Icon(
                imageVector = if (song.isLiked) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                contentDescription = if (song.isLiked) "Unlike" else "Like",
                tint = if (song.isLiked) SpotifyGreen else SpotifyGrayText,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}
