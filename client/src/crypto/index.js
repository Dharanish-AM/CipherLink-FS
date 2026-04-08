import nacl from 'tweetnacl';
import { decodeUTF8, encodeUTF8, decodeBase64, encodeBase64 } from 'tweetnacl-util';

/**
 * Generate a new box keypair.
 * Returns keys as Base64 strings.
 */
export const generateKeyPair = () => {
  const pair = nacl.box.keyPair();
  return {
    publicKey: encodeBase64(pair.publicKey),
    secretKey: encodeBase64(pair.secretKey)
  };
};

/**
 * Encrypt a message using the sender's secret key and the receiver's public key.
 * Uses authenticated encryption (nacl.box).
 */
export const encryptMessage = (message, receiverPublicKeyBase64, senderSecretKeyBase64) => {
  const receiverPublicKey = decodeBase64(receiverPublicKeyBase64);
  const senderSecretKey = decodeBase64(senderSecretKeyBase64);
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const messageUint8 = decodeUTF8(message);

  const encrypted = nacl.box(
    messageUint8,
    nonce,
    receiverPublicKey,
    senderSecretKey
  );

  return {
    ciphertext: encodeBase64(encrypted),
    nonce: encodeBase64(nonce)
  };
};

/**
 * Decrypt a message using the receiver's secret key and the sender's public key.
 */
export const decryptMessage = (ciphertextBase64, nonceBase64, senderPublicKeyBase64, receiverSecretKeyBase64) => {
  const ciphertext = decodeBase64(ciphertextBase64);
  const nonce = decodeBase64(nonceBase64);
  const senderPublicKey = decodeBase64(senderPublicKeyBase64);
  const receiverSecretKey = decodeBase64(receiverSecretKeyBase64);

  const decrypted = nacl.box.open(
    ciphertext,
    nonce,
    senderPublicKey,
    receiverSecretKey
  );

  if (!decrypted) {
    throw new Error('Failed to decrypt message: Identity or integrity check failed.');
  }

  return encodeUTF8(decrypted);
};

/**
 * Hash a public key to create a unique fingerprint for verification.
 */
export const getFingerprint = async (publicKeyBase64) => {
  const msgUint8 = decodeBase64(publicKeyBase64);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16).toUpperCase();
};
