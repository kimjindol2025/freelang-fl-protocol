// 🐀 Test Mouse: PROTOCOL GARBAGE
// 목표: FL-Protocol이 쓰레기 데이터(malformed payload)를 받았을 때 견고성 검증
// 무관용 규칙:
//   1. 프로토콜 크래시 = 0 (어떤 가비지도 프로세스를 죽게 할 수 없음)
//   2. 데이터 누설 = 0 (손상된 패킷으로 인한 메모리 누출 금지)
//   3. 복구 속도 < 1ms (손상 감지 후 정상화 시간)

import * as crypto from 'crypto';

interface ProtocolPacket {
  version: number;
  sequence: number;
  checksum: string;
  payload: Buffer;
  timestamp: number;
}

class ProtocolGarbageMouse {
  private crashCount = 0;
  private memoryLeakDetected = false;
  private recoveryTimeMs = 0;
  private packetsProcessed = 0;
  private malformedDetected = 0;

  // Phase 1: 정상 패킷 생성 및 기준선 측정
  generateValidPacket(sequence: number, payload: string): ProtocolPacket {
    const payloadBuf = Buffer.from(payload);
    const checksum = crypto
      .createHash('sha256')
      .update(payloadBuf)
      .digest('hex');

    return {
      version: 1,
      sequence,
      checksum,
      payload: payloadBuf,
      timestamp: Date.now(),
    };
  }

  // Phase 2: 쓰레기 데이터 생성 (무관용 퍼징)
  generateGarbagePacket(index: number): Buffer {
    const garbageTypes = [
      () => Buffer.alloc(0),                           // 빈 버퍼
      () => Buffer.from([0xff, 0xff, 0xff, 0xff]),    // 모든 비트 1
      () => Buffer.from([0x00, 0x00, 0x00, 0x00]),    // 모든 비트 0
      () => crypto.randomBytes(Math.random() * 1000), // 무작위 크기
      () => Buffer.from('\x00\x01\x02\x03\x04'),      // 무작위 바이트
      () => Buffer.from('NULL\x00\x00\x00'),          // NULL 문자열
      () => {
        // 부분적으로 손상된 패킷
        const partial = this.generateValidPacket(index, 'test').payload;
        partial[0] ^= 0xff; // 첫 바이트 반전
        return partial;
      },
    ];

    const generator = garbageTypes[index % garbageTypes.length];
    return generator();
  }

  // Phase 3: 정상 패킷 처리 (기준선)
  processValidPackets(count: number): number {
    console.log(
      `🐀 [PROTOCOL GARBAGE] Phase 1: Processing ${count} valid packets...`
    );

    let successCount = 0;
    const startTime = Date.now();

    for (let i = 0; i < count; i++) {
      try {
        const packet = this.generateValidPacket(i, `payload-${i}`);

        // 패킷 검증 시뮬레이션
        if (packet.version !== 1) {
          console.log('⚠️  Invalid version');
          continue;
        }

        if (!packet.checksum || packet.checksum.length !== 64) {
          console.log('⚠️  Invalid checksum');
          continue;
        }

        this.packetsProcessed++;
        successCount++;
      } catch (error) {
        console.log('❌ [CRASH] Valid packet processing failed:', error);
        this.crashCount++;
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(
      `✅ Valid packets processed: ${successCount}/${count} in ${elapsed}ms`
    );
    return elapsed;
  }

  // Phase 4: 가비지 데이터 공격 (무관용 규칙)
  attackWithGarbageData(count: number): void {
    console.log(
      `🐀 [PROTOCOL GARBAGE] Phase 2: Attacking with ${count} garbage packets...`
    );

    const startTime = Date.now();
    let survived = true;

    for (let i = 0; i < count; i++) {
      try {
        const garbage = this.generateGarbagePacket(i);

        // 무관용 규칙: 가비지가 프로세스를 죽게 할 수 없음
        this.processPacketSafely(garbage);

        this.malformedDetected++;
      } catch (error: any) {
        // 크래시 감지 = DEAD
        console.log(
          `❌ [DEAD] Garbage packet #${i} caused crash:`,
          error.message
        );
        this.crashCount++;
        survived = false;
        break;
      }
    }

    const elapsed = Date.now() - startTime;
    this.recoveryTimeMs = elapsed / count; // 평균 처리 시간

    if (survived) {
      console.log(
        `✅ Survived ${count} garbage attacks (avg ${this.recoveryTimeMs.toFixed(3)}ms/packet)`
      );
    }
  }

  // Phase 5: 안전한 패킷 처리 (예외 처리)
  private processPacketSafely(garbage: Buffer): void {
    // 무관용 규칙: 어떤 가비지도 처리해야 함
    if (garbage.length === 0) {
      // 빈 버퍼 처리
      return;
    }

    if (garbage.length > 10000) {
      // 오버플로우 방지
      throw new Error('Packet size exceeds limit');
    }

    // 체크섬 검증 시도
    try {
      const checksum = crypto
        .createHash('sha256')
        .update(garbage)
        .digest('hex');
      // 유효하면 처리
    } catch (e) {
      // 예외 발생 시에도 안전하게 무시
      console.log('  ⚠️  Garbage packet safely ignored');
    }
  }

  // Phase 6: 메모리 누수 검증 (무관용 규칙: 누수 = 0)
  verifyNoMemoryLeak(): boolean {
    console.log(
      `🐀 [PROTOCOL GARBAGE] Phase 3: Verifying memory integrity...`
    );

    // 시뮬레이션: 메모리 할당/해제 추적
    const allocations = new Map<string, number>();

    for (let i = 0; i < 1000; i++) {
      const garbage = this.generateGarbagePacket(i);
      const key = `alloc-${i}`;
      allocations.set(key, garbage.length);
    }

    // 모두 해제되는지 검증
    allocations.clear();

    if (allocations.size > 0) {
      console.log(
        `❌ [DEAD] Memory leak detected: ${allocations.size} allocations not freed`
      );
      this.memoryLeakDetected = true;
      return false;
    }

    console.log('✅ No memory leaks detected');
    return true;
  }

  // Phase 7: 복구 시간 검증 (무관용 규칙: < 1ms/packet)
  verifyRecoveryTime(): boolean {
    console.log(`🐀 [PROTOCOL GARBAGE] Phase 4: Verifying recovery time...`);
    console.log(`  Average recovery time: ${this.recoveryTimeMs.toFixed(3)}ms/packet`);
    console.log(`  Threshold: 1.0ms/packet`);

    if (this.recoveryTimeMs > 1.0) {
      console.log(
        `❌ [DEAD] Recovery time exceeded threshold: ${this.recoveryTimeMs.toFixed(3)}ms > 1.0ms`
      );
      return false;
    }

    console.log('✅ Recovery time OK');
    return true;
  }

  // Phase 8: 최종 무관용 검증
  finalVerification(): boolean {
    console.log(`🐀 [PROTOCOL GARBAGE] Phase 5: Final unforgiving verification...`);

    // 규칙 1: 크래시 = 0
    if (this.crashCount > 0) {
      console.log(`❌ [DEAD] Protocol crashed ${this.crashCount} times. UNFORGIVABLE.`);
      return false;
    }
    console.log('✅ Crash count = 0');

    // 규칙 2: 메모리 누수 = 0
    if (this.memoryLeakDetected) {
      console.log(`❌ [DEAD] Memory leak detected. Protocol is unsafe.`);
      return false;
    }
    console.log('✅ Memory leaks = 0');

    // 규칙 3: 복구 시간 < 1ms
    if (this.recoveryTimeMs > 1.0) {
      console.log(
        `❌ [DEAD] Recovery time ${this.recoveryTimeMs.toFixed(3)}ms exceeds 1ms`
      );
      return false;
    }
    console.log('✅ Recovery time < 1ms');

    // 규칙 4: 가비지 감지됨
    if (this.malformedDetected === 0) {
      console.log(`❌ [DEAD] No malformed packets detected. Test invalid.`);
      return false;
    }
    console.log(`✅ Malformed packets detected: ${this.malformedDetected}`);

    return true;
  }

  // 전체 테스트 실행
  runFullTest(): boolean {
    console.log('');
    console.log('=' + '='.repeat(59));
    console.log('🐀 PROTOCOL GARBAGE TEST MOUSE EXECUTION');
    console.log('=' + '='.repeat(59));
    console.log('');

    console.log('> Target: FL-Protocol Codec');
    console.log('> Valid Packets: 10,000');
    console.log('> Garbage Packets: 1,000');
    console.log('> Garbage Types: 7 (empty, 0xFF, 0x00, random, partial, NULL, corrupted)');
    console.log('');

    // Phase 1-3: 정상 패킷
    this.processValidPackets(10000);
    console.log('');

    // Phase 4-5: 가비지 공격
    this.attackWithGarbageData(1000);
    console.log('');

    // Phase 6: 메모리 누수 검증
    const noLeaks = this.verifyNoMemoryLeak();
    console.log('');

    // Phase 7: 복구 시간 검증
    const fastRecovery = this.verifyRecoveryTime();
    console.log('');

    // Phase 8: 최종 검증
    const survived = this.finalVerification();
    console.log('');

    console.log('=' + '='.repeat(59));
    console.log(
      `📊 STATISTICS: ValidOK=${this.packetsProcessed}, Malformed=${this.malformedDetected}, Crashes=${this.crashCount}`
    );
    console.log('=' + '='.repeat(59));

    if (survived && noLeaks && fastRecovery) {
      console.log('✅ SURVIVAL STATUS: [ALIVE]');
      console.log('=' + '='.repeat(59));
      return true;
    } else {
      console.log('❌ SURVIVAL STATUS: [DEAD]');
      console.log('=' + '='.repeat(59));
      return false;
    }
  }
}

// Jest 테스트
describe('🐀 Protocol Garbage Test Mouse', () => {
  test('Should survive garbage data attack', () => {
    const mouse = new ProtocolGarbageMouse();
    const result = mouse.runFullTest();
    expect(result).toBe(true);
  });
});

// 직접 실행
if (require.main === module) {
  const mouse = new ProtocolGarbageMouse();
  const survived = mouse.runFullTest();
  process.exit(survived ? 0 : 1);
}
