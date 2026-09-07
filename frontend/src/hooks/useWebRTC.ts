import { useEffect, useState, useCallback, useRef } from 'react';
import { meetingWebRTCManager, LocalDeviceState, RemoteParticipantStream, MeetingState } from '../services/MeetingWebRTCManager';

export const useWebRTC = () => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(meetingWebRTCManager.getLocalStream());
  const [deviceState, setDeviceState] = useState<LocalDeviceState>(meetingWebRTCManager.getDeviceState());
  const [remoteStreams, setRemoteStreams] = useState<RemoteParticipantStream[]>(meetingWebRTCManager.getRemoteStreams());
  const [meetingState, setMeetingState] = useState<MeetingState>(meetingWebRTCManager.getState());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const unsubState = meetingWebRTCManager.onStateChange(setMeetingState);
    const unsubLocal = meetingWebRTCManager.onLocalStreamChange(setLocalStream);
    const unsubDevice = meetingWebRTCManager.onDeviceStateChange(setDeviceState);
    const unsubRemote = meetingWebRTCManager.onRemoteStreamsChange(setRemoteStreams);
    const unsubErr = meetingWebRTCManager.onError((err) => {
      setErrorMessage(err.message);
      setTimeout(() => setErrorMessage(null), 5000);
    });

    return () => {
      unsubState();
      unsubLocal();
      unsubDevice();
      unsubRemote();
      unsubErr();
    };
  }, []);

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  // Sync DOM video element when local stream changes
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      if (localVideoRef.current.srcObject !== localStream) {
        localVideoRef.current.srcObject = localStream;
        localVideoRef.current.play().catch(() => {});
      }
    }
  }, [localStream]);

  const joinMeeting = useCallback((roomId: string, userName?: string) => {
    meetingWebRTCManager.join(roomId, userName);
  }, []);

  const toggleAudio = useCallback(() => {
    if (deviceState.micEnabled) {
      meetingWebRTCManager.disableMicrophone();
    } else {
      meetingWebRTCManager.enableMicrophone(deviceState.selectedMicId);
    }
  }, [deviceState.micEnabled, deviceState.selectedMicId]);

  const toggleVideo = useCallback(() => {
    if (deviceState.camEnabled) {
      meetingWebRTCManager.disableCamera();
    } else {
      meetingWebRTCManager.enableCamera(deviceState.selectedCamId);
    }
  }, [deviceState.camEnabled, deviceState.selectedCamId]);

  const toggleScreenShare = useCallback(() => {
    if (deviceState.screenSharing) {
      meetingWebRTCManager.stopScreenShare();
    } else {
      meetingWebRTCManager.startScreenShare();
    }
  }, [deviceState.screenSharing]);

  const changeCamera = useCallback((deviceId: string) => {
    meetingWebRTCManager.changeCamera(deviceId);
  }, []);

  const changeMicrophone = useCallback((deviceId: string) => {
    meetingWebRTCManager.changeMicrophone(deviceId);
  }, []);

  const changeSpeaker = useCallback((deviceId: string) => {
    meetingWebRTCManager.changeSpeaker(deviceId);
  }, []);

  const leaveMeeting = useCallback(() => {
    meetingWebRTCManager.leave();
  }, []);

  return {
    localStream,
    localVideoRef,
    remoteStreams,
    meetingState,
    isAudioMuted: !deviceState.micEnabled,
    isVideoMuted: !deviceState.camEnabled,
    isScreenSharing: deviceState.screenSharing,
    selectedCameraId: deviceState.selectedCamId,
    selectedMicId: deviceState.selectedMicId,
    selectedSpeakerId: deviceState.selectedSpeakerId,
    availableMics: deviceState.availableMics,
    availableCams: deviceState.availableCams,
    availableSpeakers: deviceState.availableSpeakers,
    joinMeeting,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    changeCamera,
    changeMicrophone,
    changeSpeaker,
    leaveMeeting,
    clearError,
    error: errorMessage
  };
};
