// 🐀 Test Mouse: JIT POISONING DEFENSE
// 목표: JIT 컴파일러가 악의적 패킷 구조(재귀/큰 타입)로 마비되지 않는지 검증
// 무관용 규칙:
//   1. Compile Time < 10ms (초과하면 JIT 최적화 실패 = FAILED)
//   2. Type Confusion = 0 (타입 캐스팅 오류 = FAILED)
//   3. Memory Exhaustion = 0 (재귀가 스택 오버플로우 유발하면 DEAD)

import * as crypto from 'crypto';

// ============ JIT 컴파일 시뮬레이션 ============
interface JITCompilationStats {
  compileTimeMs: number;
  optimizationLevel: number; // 0-3
  cacheHits: number;
  cacheMisses: number;
  inlinedFunctions: number;
}

class SimpleJITCompiler {
  private compileCache = new Map<string, JITCompilationStats>();
  private recursionDepth = 0;
  private maxRecursionDepth = 0;

  compile(typeSignature: string): JITCompilationStats {
    const startTime = Date.now();

    // 캐시 확인
    if (this.compileCache.has(typeSignature)) {
      const cached = this.compileCache.get(typeSignature)!;
      cached.cacheHits++;
      return cached;
    }

    // 재귀 감지
    this.recursionDepth++;
    if (this.recursionDepth > this.maxRecursionDepth) {
      this.maxRecursionDepth = this.recursionDepth;
    }

    if (this.recursionDepth > 100) {
      throw new Error('Recursion depth exceeded: ' + this.recursionDepth);
    }

    // 시뮬레이션: 타입 분석 + 최적화
    const optimizationLevel = Math.min(
      3,
      Math.floor(typeSignature.length / 100)
    );
    const compileTime = Math.random() * 15; // 0-15ms

    const stats: JITCompilationStats = {
      compileTimeMs: compileTime,
      optimizationLevel,
      cacheHits: 0,
      cacheMisses: 1,
      inlinedFunctions: Math.floor(Math.random() * 10),
    };

    this.compileCache.set(typeSignature, stats);
    this.recursionDepth--;

    return stats;
  }

  getMaxRecursionDepth(): number {
    return this.maxRecursionDepth;
  }

  reset(): void {
    this.compileCache.clear();
    this.recursionDepth = 0;
    this.maxRecursionDepth = 0;
  }
}

// ============ 타입 시스템 ============
interface TypeField {
  name: string;
  type: string;
  isRecursive: boolean;
  size: number;
}

interface TypeDefinition {
  name: string;
  fields: TypeField[];
  totalSize: number;
  depth: number;
}

class TypeSystem {
  private typeTable = new Map<string, TypeDefinition>();

  defineType(definition: TypeDefinition): void {
    if (this.typeTable.has(definition.name)) {
      throw new Error('Type already defined: ' + definition.name);
    }
    this.typeTable.set(definition.name, definition);
  }

  getType(name: string): TypeDefinition {
    const type = this.typeTable.get(name);
    if (!type) {
      throw new Error('Type not found: ' + name);
    }
    return type;
  }

  validateType(name: string): boolean {
    try {
      this.getType(name);
      return true;
    } catch {
      return false;
    }
  }

  clear(): void {
    this.typeTable.clear();
  }
}

// ============ JIT Poisoning Test Mouse ============
class JITPoisoningMouse {
  private jit: SimpleJITCompiler;
  private typeSystem: TypeSystem;
  private poisonedCompilations = 0;
  private typeConfusions = 0;
  private maxCompileTimeMs = 0;
  private recursionWarnings = 0;

  constructor() {
    this.jit = new SimpleJITCompiler();
    this.typeSystem = new TypeSystem();
  }

  // ============ Phase 1: 정상 타입 정의 (기준선) ============
  defineNormalTypes(): void {
    console.log('🐀 [JIT POISONING] Phase 1: Defining normal types...');

    // 정상 타입들
    const normalTypes: TypeDefinition[] = [
      {
        name: 'SimpleInt',
        fields: [{ name: 'value', type: 'i64', isRecursive: false, size: 8 }],
        totalSize: 8,
        depth: 1,
      },
      {
        name: 'Person',
        fields: [
          { name: 'name', type: 'string', isRecursive: false, size: 256 },
          { name: 'age', type: 'i32', isRecursive: false, size: 4 },
          { name: 'email', type: 'string', isRecursive: false, size: 512 },
        ],
        totalSize: 772,
        depth: 1,
      },
      {
        name: 'Node',
        fields: [
          { name: 'value', type: 'i64', isRecursive: false, size: 8 },
          { name: 'next', type: 'Node*', isRecursive: true, size: 8 },
        ],
        totalSize: 16,
        depth: 2,
      },
    ];

    for (const type of normalTypes) {
      this.typeSystem.defineType(type);
    }

    console.log(`✅ Defined ${normalTypes.length} normal types`);
  }

  // ============ Phase 2: 재귀적 구조 공격 (Recursive Poisoning) ============
  generateRecursivePoison(depth: number): TypeDefinition {
    // 매우 깊은 재귀 구조 생성
    const name = `RecursivePoison${depth}`;

    const fields: TypeField[] = [];

    for (let i = 0; i < depth; i++) {
      fields.push({
        name: `level_${i}`,
        type: `RecursivePoison${depth - 1}*`,
        isRecursive: true,
        size: 8,
      });
    }

    return {
      name,
      fields,
      totalSize: depth * 8,
      depth,
    };
  }

  attackWithRecursion(maxDepth: number): void {
    console.log(
      `🐀 [JIT POISONING] Phase 2: Attacking with recursive structures (depth=${maxDepth})...`
    );

    for (let depth = 5; depth <= maxDepth; depth += 5) {
      try {
        const poisonType = this.generateRecursivePoison(depth);

        // JIT 컴파일 시도
        const startTime = Date.now();
        const stats = this.jit.compile(poisonType.name);
        const compileTime = Date.now() - startTime;

        this.maxCompileTimeMs = Math.max(this.maxCompileTimeMs, compileTime);

        // 무관용 규칙 1: Compile Time < 10ms
        if (compileTime > 10) {
          console.log(
            `⚠️  [WARNING] Compile time exceeded: ${compileTime}ms (depth=${depth})`
          );
          this.poisonedCompilations++;
        }

        // 재귀 깊이 체크
        const recursionDepth = this.jit.getMaxRecursionDepth();
        if (recursionDepth > 50) {
          console.log(
            `⚠️  [WARNING] Deep recursion detected: ${recursionDepth} (depth=${depth})`
          );
          this.recursionWarnings++;
        }

        this.jit.reset();
      } catch (error: any) {
        console.log(
          `❌ [DEAD] Recursion attack failed at depth ${depth}: ${error.message}`
        );
        throw error;
      }
    }

    console.log('✅ Recursive structures processed');
  }

  // ============ Phase 3: 초대형 타입 정의 공격 (Type Size Poisoning) ============
  generateHugeTypePoison(fieldCount: number): TypeDefinition {
    const fields: TypeField[] = [];

    for (let i = 0; i < fieldCount; i++) {
      fields.push({
        name: `field_${i}`,
        type: i % 3 === 0 ? 'i64' : i % 3 === 1 ? 'string' : 'f64',
        isRecursive: false,
        size: i % 3 === 1 ? 1024 : i % 3 === 0 ? 8 : 8,
      });
    }

    return {
      name: `HugeType_${fieldCount}`,
      fields,
      totalSize: fields.reduce((sum, f) => sum + f.size, 0),
      depth: 1,
    };
  }

  attackWithLargeTypes(fieldCounts: number[]): void {
    console.log(
      `🐀 [JIT POISONING] Phase 3: Attacking with large type definitions...`
    );

    for (const count of fieldCounts) {
      try {
        const poisonType = this.generateHugeTypePoison(count);

        // JIT 컴파일
        const startTime = Date.now();
        const stats = this.jit.compile(poisonType.name);
        const compileTime = Date.now() - startTime;

        this.maxCompileTimeMs = Math.max(this.maxCompileTimeMs, compileTime);

        // 무관용 규칙 1: Compile Time < 10ms
        if (compileTime > 10) {
          console.log(
            `⚠️  [WARNING] Large type compilation slow: ${compileTime}ms (${count} fields)`
          );
          this.poisonedCompilations++;
        }

        this.jit.reset();
      } catch (error: any) {
        console.log(
          `❌ [DEAD] Large type attack failed at ${fieldCounts}: ${error.message}`
        );
        throw error;
      }
    }

    console.log('✅ Large types processed');
  }

  // ============ Phase 4: 타입 혼동 공격 (Type Confusion) ============
  generateConfusionPayload(): Buffer {
    // 의도적으로 타입 정보를 혼란스럽게 함
    const payload = Buffer.alloc(256);

    // 첫 4바이트: 타입 ID (혼란스럽게)
    payload.writeUInt32BE(0xdeadbeef, 0); // 잘못된 타입 ID

    // 중간: 예상과 다른 크기의 데이터
    payload.writeUInt32BE(99999, 4); // 말도 안 되는 크기

    // 끝: 재귀 포인터처럼 보이지만 실제로는 가비지
    payload.writeUInt32BE(0xffffffff, 252); // NULL 포인터 유사

    return payload;
  }

  attackWithTypeConfusion(iterations: number): void {
    console.log(
      `🐀 [JIT POISONING] Phase 4: Attacking with type confusion (${iterations} iterations)...`
    );

    for (let i = 0; i < iterations; i++) {
      try {
        const payload = this.generateConfusionPayload();

        // 타입 추론 시뮬레이션
        const typeId = payload.readUInt32BE(0);
        const size = payload.readUInt32BE(4);

        // 타입 일관성 검증
        if (typeId === 0xdeadbeef || size > 1000000) {
          this.typeConfusions++;
          console.log(`⚠️  [WARNING] Type confusion detected at iteration ${i}`);
        }
      } catch (error: any) {
        console.log(
          `❌ [DEAD] Type confusion caused crash: ${error.message}`
        );
        throw error;
      }
    }

    console.log('✅ Type confusion attacks processed');
  }

  // ============ Phase 5: 최종 무관용 검증 ============
  finalVerification(): boolean {
    console.log(
      `🐀 [JIT POISONING] Phase 5: Final unforgiving verification...`
    );

    // 규칙 1: Compile Time < 10ms
    if (this.maxCompileTimeMs > 10) {
      console.log(
        `❌ [FAILED] Max compile time exceeded: ${this.maxCompileTimeMs}ms > 10ms`
      );
      return false;
    }
    console.log(`✅ Compile time OK: ${this.maxCompileTimeMs.toFixed(2)}ms`);

    // 규칙 2: Type Confusion = 0
    if (this.typeConfusions > 0) {
      console.log(
        `❌ [FAILED] Type confusions detected: ${this.typeConfusions}`
      );
      return false;
    }
    console.log('✅ Type confusion = 0');

    // 규칙 3: Recursion 안전
    if (this.recursionWarnings > 5) {
      console.log(
        `❌ [FAILED] Too many recursion warnings: ${this.recursionWarnings}`
      );
      return false;
    }
    console.log(`✅ Recursion warnings = ${this.recursionWarnings}`);

    // 규칙 4: Poisoned compilations 최소화
    if (this.poisonedCompilations > 3) {
      console.log(
        `❌ [FAILED] Too many poisoned compilations: ${this.poisonedCompilations}`
      );
      return false;
    }
    console.log(`✅ Poisoned compilations = ${this.poisonedCompilations}`);

    return true;
  }

  // ============ 전체 테스트 실행 ============
  runFullTest(): boolean {
    console.log('');
    console.log('=' + '='.repeat(59));
    console.log('🐀 JIT POISONING DEFENSE TEST MOUSE EXECUTION');
    console.log('=' + '='.repeat(59));
    console.log('');

    console.log('> Target: FL-Protocol JIT Compiler');
    console.log('> Attack Type 1: Recursive structures (depth 5-50)');
    console.log('> Attack Type 2: Large type definitions (100-1000 fields)');
    console.log('> Attack Type 3: Type confusion payloads (1000 iterations)');
    console.log('');
    console.log('> Unforgiving Rules:');
    console.log('  1. Compile Time < 10ms');
    console.log('  2. Type Confusion = 0');
    console.log('  3. Memory Safety');
    console.log('');

    try {
      // Phase 1: 정상 타입
      this.defineNormalTypes();
      console.log('');

      // Phase 2: 재귀 공격
      this.attackWithRecursion(50);
      console.log('');

      // Phase 3: 큰 타입 공격
      this.attackWithLargeTypes([100, 250, 500, 1000]);
      console.log('');

      // Phase 4: 타입 혼동 공격
      this.attackWithTypeConfusion(1000);
      console.log('');

      // Phase 5: 최종 검증
      const survived = this.finalVerification();
      console.log('');

      console.log('=' + '='.repeat(59));
      console.log(`📊 STATISTICS:`);
      console.log(
        `  Max Compile Time: ${this.maxCompileTimeMs.toFixed(2)}ms`
      );
      console.log(`  Type Confusions: ${this.typeConfusions}`);
      console.log(`  Recursion Warnings: ${this.recursionWarnings}`);
      console.log(`  Poisoned Compilations: ${this.poisonedCompilations}`);
      console.log('=' + '='.repeat(59));

      if (survived) {
        console.log('✅ SURVIVAL STATUS: [ALIVE]');
        console.log('=' + '='.repeat(59));
        return true;
      } else {
        console.log('❌ SURVIVAL STATUS: [DEAD]');
        console.log('=' + '='.repeat(59));
        return false;
      }
    } catch (error: any) {
      console.log('');
      console.log('❌ [DEAD] Unrecoverable error:');
      console.log('Error:', error.message);
      return false;
    }
  }
}

// ============ Jest 테스트 ============
describe('🐀 JIT Poisoning Defense Test Mouse', () => {
  test('Should survive JIT poisoning attacks', () => {
    const mouse = new JITPoisoningMouse();
    const result = mouse.runFullTest();
    expect(result).toBe(true);
  });
});

// ============ 직접 실행 ============
if (require.main === module) {
  const mouse = new JITPoisoningMouse();
  const survived = mouse.runFullTest();
  process.exit(survived ? 0 : 1);
}
