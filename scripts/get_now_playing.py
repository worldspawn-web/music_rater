#!/usr/bin/env python3
"""
Windows Now Playing Media Detection Script

This script uses the Windows Runtime API (WinRT) to get information about
the currently playing media from any application that integrates with
Windows' System Media Transport Controls (SMTC).

Supported applications include: Spotify, Yandex Music, YouTube (in browser),
VLC, Windows Media Player, and many others.

Requirements:
    pip install winrt-Windows.Media.Control winrt-Windows.Foundation winrt-Windows.Storage.Streams

Usage:
    python get_now_playing.py
    
Output:
    JSON object with track info, or "null" if nothing is playing
"""

import asyncio
import json
import sys
import base64
import io

# Force UTF-8 encoding for stdout to handle Cyrillic and other Unicode characters
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')


async def get_thumbnail_as_base64(thumbnail_ref):
    """
    Extracts thumbnail image from Windows media session and converts to base64.
    
    Args:
        thumbnail_ref: The thumbnail stream reference from media properties
        
    Returns:
        str or None: Base64-encoded image data with data URI prefix, or None
    """
    try:
        if not thumbnail_ref:
            return None
            
        from winrt.windows.storage.streams import (
            DataReader,
            InputStreamOptions
        )
        
        # Open the thumbnail stream
        stream = await thumbnail_ref.open_read_async()
        
        if not stream or stream.size == 0:
            return None
        
        # Read the stream content
        reader = DataReader(stream)
        await reader.load_async(stream.size)
        
        # Read bytes
        buffer = bytearray(stream.size)
        reader.read_bytes(buffer)
        
        # Convert to base64
        base64_data = base64.b64encode(bytes(buffer)).decode('utf-8')
        
        # Determine content type (usually JPEG or PNG)
        content_type = stream.content_type or "image/jpeg"
        
        return f"data:{content_type};base64,{base64_data}"
        
    except Exception as e:
        # Thumbnail extraction failed - not critical
        return None


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
        
        # Try to get thumbnail/artwork
        thumbnail_base64 = None
        try:
            thumbnail_base64 = await get_thumbnail_as_base64(media_properties.thumbnail)
        except Exception:
            pass  # Thumbnail extraction is optional
        
        return {
            "title": media_properties.title or "",
            "artist": media_properties.artist or "",
            "album": media_properties.album_title or "",
            "albumArtist": media_properties.album_artist or "",
            "trackNumber": media_properties.track_number or 0,
            "genres": list(media_properties.genres) if media_properties.genres else [],
            "sourceApp": source_app_id,
            "isPlaying": playback_info.playback_status == 4 if playback_info else False,  # 4 = Playing
            "thumbnail": thumbnail_base64
        }
        
    except ImportError as e:
        # WinRT packages not installed
        print(json.dumps({
            "error": "WINRT_NOT_INSTALLED",
            "message": f"Required packages not installed: {str(e)}",
            "install": "pip install winrt-Windows.Media.Control winrt-Windows.Foundation winrt-Windows.Storage.Streams"
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

