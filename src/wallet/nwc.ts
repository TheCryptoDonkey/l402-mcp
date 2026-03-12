import type { WalletProvider, PaymentResult } from './types.js'

export function createNwcWallet(nwcUri: string): WalletProvider {
  return {
    method: 'nwc',
    available: true,

    async payInvoice(invoice: string): Promise<PaymentResult> {
      // Parse NWC URI: nostr+walletconnect://<pubkey>?relay=<relay>&secret=<secret>
      const url = new URL(nwcUri.replace('nostr+walletconnect://', 'https://'))
      const walletPubkey = url.hostname || url.pathname.replace('//', '')
      const relay = url.searchParams.get('relay')
      const secret = url.searchParams.get('secret')

      if (!relay || !secret) {
        return { paid: false, method: 'nwc', reason: 'Invalid NWC URI: missing relay or secret' }
      }

      try {
        const { getPublicKey, finalizeEvent } = await import('nostr-tools/pure')
        const { Relay } = await import('nostr-tools/relay')
        const { encrypt, decrypt, getConversationKey } = await import('nostr-tools/nip44')

        const secretBytes = hexToBytes(secret)
        getPublicKey(secretBytes)

        const conversationKey = getConversationKey(secretBytes, walletPubkey)

        const content = JSON.stringify({
          method: 'pay_invoice',
          params: { invoice },
        })

        const encrypted = encrypt(content, conversationKey)

        const event = finalizeEvent({
          kind: 23194,
          created_at: Math.floor(Date.now() / 1000),
          tags: [['p', walletPubkey]],
          content: encrypted,
        }, secretBytes)

        // Zeroise secret bytes now that signing is complete
        secretBytes.fill(0)

        const r = await Relay.connect(relay)

        return new Promise<PaymentResult>((resolve) => {
          const timeout = setTimeout(() => {
            conversationKey.fill(0)
            r.close()
            resolve({ paid: false, method: 'nwc', reason: 'NWC payment timeout' })
          }, 60_000)

          r.subscribe([{
            kinds: [23195],
            '#e': [event.id],
            authors: [walletPubkey],
          }], {
            onevent: (responseEvent) => {
              clearTimeout(timeout)
              try {
                const decrypted = decrypt(responseEvent.content, conversationKey)
                const response = JSON.parse(decrypted)
                if (response.result?.preimage) {
                  conversationKey.fill(0)
                  r.close()
                  resolve({ paid: true, preimage: response.result.preimage, method: 'nwc' })
                } else {
                  conversationKey.fill(0)
                  r.close()
                  resolve({ paid: false, method: 'nwc', reason: response.error?.message ?? 'Payment failed' })
                }
              } catch (err) {
                conversationKey.fill(0)
                r.close()
                resolve({ paid: false, method: 'nwc', reason: String(err) })
              }
            },
          })

          r.publish(event)
        })
      } catch (err) {
        return { paid: false, method: 'nwc', reason: String(err) }
      }
    },
  }
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length === 0 || hex.length % 2 !== 0) {
    throw new TypeError(`Hex string must have even length (got ${hex.length})`)
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new TypeError('String contains non-hex characters')
  }
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}
