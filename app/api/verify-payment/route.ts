// app/api/verify-payment/route.ts
import { NextRequest, NextResponse } from 'next/server';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function POST(req: NextRequest) {
  if (!PAYSTACK_SECRET_KEY) {
    return NextResponse.json(
      { error: 'Paystack secret key not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const { reference } = body;

    if (!reference) {
      return NextResponse.json(
        { error: 'Missing payment reference' },
        { status: 400 }
      );
    }

    // ✅ Fixed: No trailing spaces in URL
    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Paystack API error:', text);
      return NextResponse.json(
        { error: 'Paystack verification failed' },
        { status: response.status }
      );
    }

    const result = await response.json();

    if (result.data?.status === 'success' && result.data.amount === 150000) {
      return NextResponse.json({ success: true }, { status: 200 });
    } else {
      return NextResponse.json(
        { error: 'Invalid payment amount or status' },
        { status: 400 }
      );
    }
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error('Verification error:', message);
    return NextResponse.json(
      { error: 'Payment verification failed' },
      { status: 500 }
    );
  }
}