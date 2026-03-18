import type { LightningBackend, Invoice, InvoiceStatus } from '@forgesworn/toll-booth'
import { createHash, randomBytes } from 'node:crypto'

/**
 * Mock Lightning backend that auto-settles every invoice immediately.
 * Implements toll-booth's LightningBackend interface.
 *
 * The preimage is generated first, and the paymentHash is derived as
 * sha256(preimage) so that toll-booth's L402 verification succeeds.
 *
 * Note: The bolt11 string is a placeholder. Integration tests should use
 * the paymentHash from toll-booth's response directly rather than decoding
 * the bolt11 string (which requires a real BOLT-11 encoder).
 */
export function mockLightningBackend(): LightningBackend {
  const invoices = new Map<string, { preimage: string; amountSats: number }>()

  return {
    async createInvoice(amountSats: number, _memo?: string): Promise<Invoice> {
      const preimage = randomBytes(32).toString('hex')
      const paymentHash = createHash('sha256')
        .update(Buffer.from(preimage, 'hex'))
        .digest('hex')

      // Placeholder BOLT-11; not decodable by the bolt11 npm package.
      // Tests use the payment_hash from toll-booth's JSON responses instead.
      const bolt11 = `lnbc${amountSats}n1mock${paymentHash.slice(0, 20)}`

      invoices.set(paymentHash, { preimage, amountSats })

      return { bolt11, paymentHash }
    },

    async checkInvoice(paymentHash: string): Promise<InvoiceStatus> {
      const invoice = invoices.get(paymentHash)
      if (!invoice) {
        return { paid: false }
      }
      return { paid: true, preimage: invoice.preimage }
    },
  }
}
