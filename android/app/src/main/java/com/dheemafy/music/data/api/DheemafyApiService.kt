package com.dheemafy.music.data.api

import com.dheemafy.music.data.model.*
import retrofit2.Response
import retrofit2.http.*

interface DheemafyApiService {

    @POST("api/auth/login")
    suspend fun login(
        @Body request: LoginRequest
    ): Response<ApiResponse<AuthData>>

    @GET("api/auth/me")
    suspend fun getMe(): Response<ApiResponse<User>>

    @GET("api/home")
    suspend fun getHome(): Response<ApiResponse<HomeData>>

    @GET("api/songs")
    suspend fun getSongs(
        @Query("folder") folder: String? = null,
        @Query("artist") artist: String? = null,
        @Query("artistId") artistId: String? = null,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 100
    ): Response<ApiResponse<List<Song>>>

    @GET("api/songs/{id}")
    suspend fun getSong(
        @Path("id") id: String
    ): Response<ApiResponse<Song>>

    @POST("api/songs/{id}/like")
    suspend fun likeSong(
        @Path("id") id: String
    ): Response<Unit>

    @POST("api/songs/{id}/unlike")
    suspend fun unlikeSong(
        @Path("id") id: String
    ): Response<Unit>

    @GET("api/playlists")
    suspend fun getPlaylists(): Response<ApiResponse<List<Playlist>>>

    @GET("api/playlists/{id}")
    suspend fun getPlaylist(
        @Path("id") id: String
    ): Response<ApiResponse<PlaylistDetail>>

    @GET("api/artists")
    suspend fun getArtists(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 50
    ): Response<ApiResponse<List<Artist>>>

    @GET("api/artists/{slugOrId}")
    suspend fun getArtist(
        @Path("slugOrId") slugOrId: String
    ): Response<ApiResponse<ArtistDetail>>

    @GET("api/search")
    suspend fun search(
        @Query("q") query: String
    ): Response<ApiResponse<SearchData>>

    @POST("api/playback/record")
    suspend fun recordPlayback(
        @Body request: PlaybackRecordRequest
    ): Response<Unit>
}
