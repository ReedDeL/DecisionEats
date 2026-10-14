import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import {
  nextCameraDeviceId,
  toCameraDevices,
  videoConstraintsFor,
  type CameraCaptureProps,
  type CameraDevice,
} from '@/lib/webcam';
import { layout, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { useReducedMotion } from '@/lib/use-reduced-motion';

type Phase = 'requesting' | 'live' | 'closed' | 'unavailable';

/**
 * Live getUserMedia camera for the web build
 * (docs/superpowers/specs/2026-08-10-web-webcam-capture-design.md).
 * expo-image-picker has no real camera on web, so this replaces "Take a
 * photo" there. Native gets CameraCapture.tsx, which renders nothing.
 */
export function CameraCapture({ visible, onCapture, onClose, onUnavailable }: CameraCaptureProps) {
  const { color } = useTheme();
  const reducedMotion = useReducedMotion();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Bumped on every stopStream() and every new startStream() call so a
  // slow-resolving getUserMedia from a superseded request can tell it's
  // stale and back out instead of orphaning a stream or stomping newer state.
  const requestIdRef = useRef(0);

  const [phase, setPhase] = useState<Phase>('closed');
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    requestIdRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startStream = useCallback(
    async (deviceId: string | null) => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setPhase('unavailable');
        return;
      }

      setPhase('requesting');
      stopStream();
      const requestId = ++requestIdRef.current;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraintsFor(deviceId),
          audio: false,
        });

        // A newer request (cancel, close, or another device switch) landed
        // while this one was in flight — stop the now-unwanted tracks and
        // leave streamRef/videoRef/state alone; they belong to that request.
        if (requestId !== requestIdRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch {
            // A rejected play() (e.g. AbortError from an autoplay-policy
            // edge case) doesn't mean the stream failed — the <video> has
            // autoplay set and will typically start on its own. Treat the
            // stream as acquired either way rather than falling into the
            // catch below and reporting a working camera as unavailable.
          }
        }

        if (requestId !== requestIdRef.current) return;
        const settledDeviceId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? deviceId;
        setActiveDeviceId(settledDeviceId ?? null);

        // Enumeration can fail even with a working stream. Capture should
        // remain available; only the optional Flip action needs this list.
        try {
          const mediaDevices = await navigator.mediaDevices.enumerateDevices();
          if (requestId !== requestIdRef.current) return;
          setDevices(toCameraDevices(mediaDevices));
        } catch {
          if (requestId !== requestIdRef.current) return;
          setDevices([]);
        }

        setPhase('live');
      } catch {
        if (requestId !== requestIdRef.current) return;
        setPhase('unavailable');
      }
    },
    [stopStream]
  );

  useEffect(() => {
    if (!visible) {
      stopStream();
      setPhase('closed');
      setDevices([]);
      setActiveDeviceId(null);
      return;
    }

    void startStream(null);

    return () => {
      stopStream();
    };
    // Deliberately depends on `visible` alone: startStream/stopStream are
    // stable (useCallback), and this effect should re-run only when the
    // parent opens or closes the view, not on every render.
  }, [visible]);

  const setPreviewContainer = useCallback((node: View | null) => {
    // react-native-web forwards a View's ref to its underlying DOM node.
    const element = node as unknown as HTMLElement | null;

    if (!element) {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.remove();
        videoRef.current = null;
      }
      return;
    }

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    element.appendChild(video);
    videoRef.current = video;

    if (streamRef.current) {
      video.srcObject = streamRef.current;
      void video.play();
    }
  }, []);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (
      phase !== 'live' ||
      !video ||
      !streamRef.current ||
      video.srcObject !== streamRef.current ||
      video.videoWidth === 0
    )
      return;

    if (!captureCanvasRef.current) {
      captureCanvasRef.current = document.createElement('canvas');
    }
    const canvas = captureCanvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    onCapture(canvas.toDataURL('image/jpeg', 0.92));
  }, [onCapture, phase]);

  const handleFlipCamera = useCallback(() => {
    if (phase !== 'live') return;
    const nextDeviceId = nextCameraDeviceId(devices, activeDeviceId);
    if (nextDeviceId) void startStream(nextDeviceId);
  }, [phase, devices, activeDeviceId, startStream]);

  if (!visible) return null;

  const unavailable = phase === 'unavailable';

  return (
    <Modal
      visible={visible}
      animationType={reducedMotion ? 'none' : 'fade'}
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { backgroundColor: color.surfaceAlt }]}>
        <View style={styles.column}>
          <Screen
            footer={
              <View style={styles.footer}>
                {unavailable ? (
                  <PrimaryButton
                    label="Choose a photo instead"
                    onPress={onUnavailable}
                    accessibilityHint="Opens your photo library instead of the camera"
                  />
                ) : (
                  <PrimaryButton
                    label="Capture photo"
                    onPress={handleCapture}
                    disabled={phase !== 'live'}
                    accessibilityHint="Takes a photo with the live camera"
                  />
                )}
                <PrimaryButton
                  label="Cancel"
                  variant="ghost"
                  onPress={onClose}
                  accessibilityHint="Closes the camera without taking a photo"
                />
              </View>
            }
          >
            <Text variant="display">Point your camera</Text>
            <Text variant="body" tone="muted">
              {unavailable
                ? "We couldn't reach a camera on this device."
                : phase === 'requesting'
                  ? 'Requesting camera access…'
                  : 'Get the shelves in frame, then capture.'}
            </Text>

            {unavailable ? null : (
              <>
                <View
                  ref={setPreviewContainer}
                  style={[styles.preview, { borderColor: color.border }]}
                />

                {devices.length > 1 ? (
                  <View style={styles.flipAction}>
                    <PrimaryButton
                      label="Flip camera"
                      variant="secondary"
                      onPress={handleFlipCamera}
                      disabled={phase !== 'live'}
                      accessibilityHint="Switches the live preview to the next available camera"
                    />
                  </View>
                ) : null}
              </>
            )}
          </Screen>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: layout.mobileViewportMaxWidth, alignSelf: 'center' },
  preview: {
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  flipAction: { marginTop: space.sm },
  footer: { gap: space.sm },
});
