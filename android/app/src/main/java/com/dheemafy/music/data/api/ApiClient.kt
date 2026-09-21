package com.dheemafy.music.data.api

import com.dheemafy.music.data.local.SessionManager
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

class ApiClient(private val sessionManager: SessionManager) {

    private var currentBaseUrl: String = sessionManager.getBaseUrl()
    private var cachedService: DheemafyApiService? = null

    val service: DheemafyApiService
        get() {
            val url = sessionManager.getBaseUrl()
            if (cachedService == null || currentBaseUrl != url) {
                currentBaseUrl = url
                cachedService = createService(currentBaseUrl)
            }
            return cachedService!!
        }

    private fun createService(baseUrl: String): DheemafyApiService {
        val authInterceptor = Interceptor { chain ->
            val requestBuilder = chain.request().newBuilder()
            sessionManager.getToken()?.let { token ->
                requestBuilder.addHeader("Authorization", "Bearer $token")
            }
            requestBuilder.addHeader("Accept", "application/json")
            chain.proceed(requestBuilder.build())
        }

        val loggingInterceptor = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }

        val okHttpClient = OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .addInterceptor(loggingInterceptor)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()

        val retrofit = Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        return retrofit.create(DheemafyApiService::class.java)
    }
}
