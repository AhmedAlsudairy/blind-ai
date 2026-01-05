import { useEffect, useState, useRef } from 'react';
import { sendEmergencySMS } from '@/app/actions';

export function useFallDetection(onFall: () => void) {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const lastAlertTime = useRef<number>(0);
  const COOLDOWN_MS = 30000; // 30 seconds cooldown between alerts
  const THRESHOLD = 25; // m/s^2 (approx 2.5g) - Adjust based on testing

  useEffect(() => {
    const handleMotion = async (event: DeviceMotionEvent) => {
      if (!event.accelerationIncludingGravity) return;

      const { x, y, z } = event.accelerationIncludingGravity;
      if (x === null || y === null || z === null) return;

      // Calculate total acceleration vector length
      const acceleration = Math.sqrt(x * x + y * y + z * z);

      if (acceleration > THRESHOLD) {
        const now = Date.now();
        if (now - lastAlertTime.current > COOLDOWN_MS) {
          lastAlertTime.current = now;
          console.log("FALL DETECTED! Acceleration:", acceleration);
          
          // Trigger local callback (e.g., for UI or TTS)
          onFall();

          // Get Location and Send SMS
          if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
              async (position) => {
                const { latitude, longitude } = position.coords;
                await sendEmergencySMS(latitude, longitude);
              },
              async (error) => {
                console.error("Error getting location:", error);
                // Send SMS without location if GPS fails
                await sendEmergencySMS(null, null);
              },
              { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
            );
          } else {
             await sendEmergencySMS(null, null);
          }
        }
      }
    };

    // Request permission for iOS 13+ devices
    const requestPermission = async () => {
      if (
        typeof DeviceMotionEvent !== 'undefined' &&
        (DeviceMotionEvent as any).requestPermission
      ) {
        try {
          const response = await (DeviceMotionEvent as any).requestPermission();
          if (response === 'granted') {
            window.addEventListener('devicemotion', handleMotion);
            setIsMonitoring(true);
          }
        } catch (e) {
          console.error("DeviceMotion permission error:", e);
        }
      } else {
        // Non-iOS 13+ devices
        window.addEventListener('devicemotion', handleMotion);
        setIsMonitoring(true);
      }
    };

    requestPermission();

    return () => {
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, [onFall]);

  return isMonitoring;
}
