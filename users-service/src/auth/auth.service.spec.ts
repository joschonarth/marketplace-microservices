import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { User } from '../users/entities/user.entity';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';
import * as bcryptjs from 'bcryptjs';

jest.mock('bcryptjs');

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: jest.Mocked<
    Pick<UsersService, 'findByEmail' | 'findByEmailWithPassword' | 'create'>
  >;
  let jwtService: jest.Mocked<Pick<JwtService, 'sign'>>;

  const registerDto: RegisterDto = {
    email: 'test@example.com',
    password: 'password123',
    firstName: 'João',
    lastName: 'Silva',
    role: UserRole.BUYER,
  };

  const mockUser: User = {
    id: 'uuid-123',
    email: registerDto.email,
    password: '$2a$10$hashedpassword',
    firstName: registerDto.firstName,
    lastName: registerDto.lastName,
    role: UserRole.BUYER,
    status: UserStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn(),
      findByEmailWithPassword: jest.fn(),
      create: jest.fn(),
    };

    jwtService = {
      sign: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      (bcryptjs.hash as jest.Mock).mockResolvedValue('$2a$10$hashedpassword');
      usersService.create.mockResolvedValue(mockUser);

      const result = await authService.register(registerDto);

      expect(usersService.findByEmail).toHaveBeenCalledWith(registerDto.email);
      expect(bcryptjs.hash).toHaveBeenCalledWith(registerDto.password, 10);
      expect(usersService.create).toHaveBeenCalledWith({
        ...registerDto,
        password: '$2a$10$hashedpassword',
        status: UserStatus.ACTIVE,
      });
      expect(result).toEqual(mockUser);
    });

    it('should throw ConflictException when email already exists', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);

      await expect(authService.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(authService.register(registerDto)).rejects.toThrow(
        'Email already registered',
      );
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('should hash the password with 10 salt rounds', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      (bcryptjs.hash as jest.Mock).mockResolvedValue('$2a$10$hashedpassword');
      usersService.create.mockResolvedValue(mockUser);

      await authService.register(registerDto);

      expect(bcryptjs.hash).toHaveBeenCalledWith('password123', 10);
    });
  });

  describe('login', () => {
    const loginDto: LoginDto = {
      email: 'test@example.com',
      password: 'password123',
    };

    it('should login successfully and return user with token', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(mockUser);
      (bcryptjs.compare as jest.Mock).mockResolvedValue(true);
      jwtService.sign.mockReturnValue('jwt-token-123');

      const result = await authService.login(loginDto);

      expect(usersService.findByEmailWithPassword).toHaveBeenCalledWith(
        loginDto.email,
      );
      expect(bcryptjs.compare).toHaveBeenCalledWith(
        loginDto.password,
        mockUser.password,
      );
      expect(result).toEqual({ user: mockUser, token: 'jwt-token-123' });
    });

    it('should generate JWT with correct payload (sub, email, role)', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(mockUser);
      (bcryptjs.compare as jest.Mock).mockResolvedValue(true);
      jwtService.sign.mockReturnValue('jwt-token-123');

      await authService.login(loginDto);

      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });
    });

    it('should throw UnauthorizedException when email is not found', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(null);

      await expect(authService.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(authService.login(loginDto)).rejects.toThrow(
        'Credenciais inválidas',
      );
      expect(bcryptjs.compare).not.toHaveBeenCalled();
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when password is incorrect', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(mockUser);
      (bcryptjs.compare as jest.Mock).mockResolvedValue(false);

      await expect(authService.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(authService.login(loginDto)).rejects.toThrow(
        'Credenciais inválidas',
      );
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when account is inactive', async () => {
      const inactiveUser: User = {
        ...mockUser,
        status: UserStatus.INACTIVE,
      };
      usersService.findByEmailWithPassword.mockResolvedValue(inactiveUser);
      (bcryptjs.compare as jest.Mock).mockResolvedValue(true);

      await expect(authService.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(authService.login(loginDto)).rejects.toThrow(
        'Conta inativa',
      );
      expect(jwtService.sign).not.toHaveBeenCalled();
    });
  });
});
