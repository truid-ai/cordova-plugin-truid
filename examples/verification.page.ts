import { Component } from '@angular/core';

import { TruIDPlugin, LaunchOptions, LaunchResult } from '../../definitions/truid';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-verification',
  templateUrl: 'verification.page.html',
  styleUrls: ['verification.page.scss'],
})
export class VerificationPage {
  isVerifying = false;
  result: LaunchResult | null = null;
  errorMessage: string | null = null;

  constructor() {}

  async startVerification() {
    this.isVerifying = true;
    this.result = null;
    this.errorMessage = null;

    try {
      const options: LaunchOptions = {
        apiKey: environment.truid.apiKey, // Fetch from backend in production, never hardcode
        endPoint: environment.truid.endPoint,
       };

      this.result = await TruIDPlugin.launchSDK(options);

      console.log('Verification successful:', this.result.sessionId);
      this.handleVerificationSuccess(this.result);

    } catch (error) {
      console.error('Verification failed:', error);
      this.handleVerificationError(error);
    } finally {
      this.isVerifying = false;
    }
  }

  private handleVerificationSuccess(result: LaunchResult) {
    // Send sessionId to backend for processing
    // Update UI to show verification complete
  }

  private handleVerificationError(error: any) {
    this.errorMessage = typeof error === 'string'
      ? error
      : (error && error.message) ? error.message : 'Verification failed';
  }
}
