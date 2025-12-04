#!/usr/bin/env python3
"""
Windows Now Playing Media Detection Script

This script uses the Windows Runtime API (WinRT) to get information about
the currently playing media from any application that integrates with
Windows' System Media Transport Controls (SMTC).

Supported applications include: Spotify, Yandex Music, YouTube (in browser),
VLC, Windows Media Player, and many others.

Requirements:
    pip install winrt-Windows.Media.Control winrt-Windows.Foundation

Usage:
    python get_now_playing.py
    
Output:
    JSON object with track info, or "null" if nothing is playing
"""

import asyncio
import json
import sys


async def get_media_info():
    """
    Retrieves information about the currently playing media.
    
    Returns:
        dict or None: Dictionary with title, artist, album, and app info,
                      or None if no media is playing.
    """
    try:
        # Import WinRT modules
        from winrt.windows.media.control import (
            GlobalSystemMediaTransportControlsSessionManager as MediaManager
        )
        
        # Request access to media session manager
        sessions = await MediaManager.request_async()
        
        # Get the current active session
        current_session = sessions.get_current_session()
        
        if not current_session:
            return None
        
        # Get media properties
        media_properties = await current_session.try_get_media_properties_async()
        
        if not media_properties:
            return None
        
        # Get playback info to check if actually playing
        playback_info = current_session.get_playback_info()
        
        # Get the source app info
        source_app_id = current_session.source_app_user_model_id or "Unknown"
        
        return {
            "title": media_properties.title or "",
            "artist": media_properties.artist or "",
            "album": media_properties.album_title or "",
            "albumArtist": media_properties.album_artist or "",
            "trackNumber": media_properties.track_number or 0,
            "genres": list(media_properties.genres) if media_properties.genres else [],
            "sourceApp": source_app_id,
            "isPlaying": playback_info.playback_status == 4 if playback_info else False  # 4 = Playing
        }
        
    except ImportError as e:
        # WinRT packages not installed
        print(json.dumps({
            "error": "WINRT_NOT_INSTALLED",
            "message": f"Required packages not installed: {str(e)}",
            "install": "pip install winrt-Windows.Media.Control winrt-Windows.Foundation"
        }))
        sys.exit(1)
        
    except Exception as e:
        # Other errors
        print(json.dumps({
            "error": "MEDIA_ACCESS_ERROR",
            "message": str(e)
        }))
        sys.exit(1)


def main():
    """Main entry point."""
    try:
        # Run the async function
        result = asyncio.run(get_media_info())
        
        # Output as JSON
        if result:
            print(json.dumps(result, ensure_ascii=False))
        else:
            print("null")
            
    except KeyboardInterrupt:
        sys.exit(0)
    except Exception as e:
        print(json.dumps({
            "error": "UNEXPECTED_ERROR",
            "message": str(e)
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()

