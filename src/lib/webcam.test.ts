import { describe, expect, it } from 'vitest';

import { nextCameraDeviceId, toCameraDevices, videoConstraintsFor } from '@/lib/webcam';

describe('toCameraDevices', () => {
  it('keeps only videoinput devices', () => {
    const devices = toCameraDevices([
      { kind: 'audioinput', deviceId: 'a1', label: 'Mic' },
      { kind: 'videoinput', deviceId: 'v1', label: 'Webcam' },
      { kind: 'audiooutput', deviceId: 'o1', label: 'Speaker' },
    ]);

    expect(devices).toEqual([{ deviceId: 'v1', label: 'Webcam' }]);
  });

  it('falls back to a numbered label when the browser has not granted one yet', () => {
    const devices = toCameraDevices([
      { kind: 'videoinput', deviceId: 'v1', label: '' },
      { kind: 'videoinput', deviceId: 'v2', label: '' },
    ]);

    expect(devices).toEqual([
      { deviceId: 'v1', label: 'Camera 1' },
      { deviceId: 'v2', label: 'Camera 2' },
    ]);
  });

  it('ignores cameras without a selectable id and duplicate entries', () => {
    expect(
      toCameraDevices([
        { kind: 'videoinput', deviceId: '', label: 'Unknown' },
        { kind: 'videoinput', deviceId: 'v1', label: 'Webcam' },
        { kind: 'videoinput', deviceId: 'v1', label: 'Webcam again' },
      ])
    ).toEqual([{ deviceId: 'v1', label: 'Webcam' }]);
  });

  it('keeps real labels when present', () => {
    const devices = toCameraDevices([
      { kind: 'videoinput', deviceId: 'v1', label: 'FaceTime HD Camera' },
    ]);

    expect(devices).toEqual([{ deviceId: 'v1', label: 'FaceTime HD Camera' }]);
  });
});

describe('videoConstraintsFor', () => {
  it('prefers the rear camera when no device is chosen', () => {
    expect(videoConstraintsFor(null)).toEqual({ facingMode: { ideal: 'environment' } });
  });

  it('constrains to the exact device id when one is chosen', () => {
    expect(videoConstraintsFor('v1')).toEqual({ deviceId: { exact: 'v1' } });
  });
});

describe('nextCameraDeviceId', () => {
  const devices = [
    { deviceId: 'front', label: 'Front' },
    { deviceId: 'rear', label: 'Rear' },
    { deviceId: 'usb', label: 'USB webcam' },
  ];

  it('does not offer a switch with a single camera', () => {
    expect(nextCameraDeviceId(devices.slice(0, 1), 'front')).toBeNull();
  });

  it('cycles through every available camera', () => {
    expect(nextCameraDeviceId(devices, 'rear')).toBe('usb');
    expect(nextCameraDeviceId(devices, 'usb')).toBe('front');
  });

  it('starts with the first camera when the active id is unavailable', () => {
    expect(nextCameraDeviceId(devices, 'missing')).toBe('front');
  });
});
