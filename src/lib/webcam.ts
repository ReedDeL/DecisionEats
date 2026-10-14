/**
 * Pure helpers for the web camera picker (src/components/CameraCapture.web.tsx).
 * Kept separate from the DOM-heavy component so device-list shaping and
 * constraint-building can be unit tested without a browser.
 */

export interface CameraDevice {
  deviceId: string;
  label: string;
}

/**
 * Public contract shared by CameraCapture.tsx (native stub) and
 * CameraCapture.web.tsx (real implementation). Metro resolves the platform
 * file at bundle time, but `tsc` only ever sees the native one when
 * type-checking `@/components/CameraCapture` — so this lives here, in a
 * module both files import, instead of being declared twice and risking
 * silent drift. Web-only internals (like the "unavailable" phase) stay out
 * of this type; they're private to CameraCapture.web.tsx.
 */
export interface CameraCaptureProps {
  visible: boolean;
  onCapture: (dataUri: string) => void;
  onClose: () => void;
  onUnavailable: () => void;
}

interface DeviceLike {
  kind: string;
  deviceId: string;
  label: string;
}

/**
 * Video-input devices only, with a numbered fallback label for the moment
 * before permission is granted, when the browser reports every label as "".
 */
export function toCameraDevices(devices: readonly DeviceLike[]): CameraDevice[] {
  return devices
    .filter((device) => device.kind === 'videoinput' && device.deviceId)
    .filter(
      (device, index, inputs) =>
        inputs.findIndex((input) => input.deviceId === device.deviceId) === index
    )
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `Camera ${index + 1}`,
    }));
}

/** Prefer a rear camera on phones; use the browser's available camera otherwise. */
export function videoConstraintsFor(deviceId: string | null): MediaTrackConstraints | boolean {
  return deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } };
}

/** Cycle through available cameras, including multiple desktop webcams. */
export function nextCameraDeviceId(
  devices: readonly CameraDevice[],
  activeDeviceId: string | null
) {
  if (devices.length < 2) return null;
  const currentIndex = devices.findIndex((device) => device.deviceId === activeDeviceId);
  return devices[(currentIndex + 1) % devices.length]?.deviceId ?? null;
}
