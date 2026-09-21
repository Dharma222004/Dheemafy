package com.dheemafy.music.data.local

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import com.dheemafy.music.data.model.User
import com.google.gson.Gson
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class SessionManager(context: Context) {

    private val prefs: SharedPreferences = try {
        val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
        EncryptedSharedPreferences.create(
            PREFS_NAME,
            masterKeyAlias,
            context,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    } catch (e: Exception) {
        // Fallback to standard private prefs if Keystore/Crypto fails on certain devices/emulators
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    private val gson = Gson()

    private val _isLoggedIn = MutableStateFlow(hasValidToken())
    val isLoggedIn: StateFlow<Boolean> = _isLoggedIn.asStateFlow()

    private val _currentUser = MutableStateFlow(getUser())
    val currentUser: StateFlow<User?> = _currentUser.asStateFlow()

    fun saveAuthData(token: String, user: User) {
        prefs.edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_USER, gson.toJson(user))
            .apply()
        _isLoggedIn.value = true
        _currentUser.value = user
    }

    fun getToken(): String? {
        return prefs.getString(KEY_TOKEN, null)
    }

    fun hasValidToken(): Boolean {
        return !prefs.getString(KEY_TOKEN, null).isNullOrBlank()
    }

    fun getUser(): User? {
        val json = prefs.getString(KEY_USER, null) ?: return null
        return try {
            gson.fromJson(json, User::class.java)
        } catch (e: Exception) {
            null
        }
    }

    fun getBaseUrl(): String {
        val saved = prefs.getString(KEY_BASE_URL, null)
        if (saved.isNullOrBlank() || saved == "http://10.0.2.2:4534/") {
            return DEFAULT_BASE_URL
        }
        return saved
    }

    fun saveBaseUrl(url: String) {
        var cleanUrl = url.trim()
        if (!cleanUrl.endsWith("/")) {
            cleanUrl += "/"
        }
        prefs.edit().putString(KEY_BASE_URL, cleanUrl).apply()
    }

    fun logout() {
        prefs.edit()
            .remove(KEY_TOKEN)
            .remove(KEY_USER)
            .apply()
        _isLoggedIn.value = false
        _currentUser.value = null
    }

    companion object {
        private const val PREFS_NAME = "dheemafy_secure_prefs"
        private const val KEY_TOKEN = "jwt_token"
        private const val KEY_USER = "current_user"
        private const val KEY_BASE_URL = "base_server_url"

        const val DEFAULT_BASE_URL = "https://dheemafy.vercel.app/"
    }
}
